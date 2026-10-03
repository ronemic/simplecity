import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { LlmReadyMeeting } from "@/lib/types";
import {
  classifyDecisionOutcome,
  extractDecisionOutcome,
  extractResultText,
  interpretOfficialAction
} from "@/lib/outcomes/extractDecisionOutcome";

const readMinutes = (date: string) => fs.readFileSync(
  new URL(`./fixtures/foster-city-${date}-minutes.txt`, import.meta.url),
  "utf8"
);
const may4Minutes = readMinutes("2026-05-04");
const june1Minutes = readMinutes("2026-06-01");
const june15Minutes = readMinutes("2026-06-15");

function motionParagraph(minutes: string, reference: string) {
  const paragraph = minutes.split(/\n\s*\n/).find(
    (text) => /^Motion by/.test(text.trim()) && text.includes(reference)
  );
  assert.ok(paragraph, `Official motion ${reference} exists in the fixture`);
  return paragraph.trim().replace(/\s+/g, " ");
}

const employmentTitle = "Adopt amended and restated City Manager employment agreement";
const employmentMotion = motionParagraph(june1Minutes, "2026-057");
const budgetMotion = motionParagraph(june1Minutes, "2079");
const artMotion = motionParagraph(may4Minutes, "2074");
const cooperationMotion = motionParagraph(june15Minutes, "2026-066");

function fixtureMeeting(
  minutes: string,
  title: string,
  agendaNumber: string,
  date: string,
  templateId: number
): LlmReadyMeeting {
  return {
    id: `foster-city-${date}`,
    jurisdictionSlug: "foster-city",
    platform: "primegov",
    section: "Past Meetings",
    title: "City Council Regular Meeting",
    dateText: date,
    meetingType: "City Council",
    rowText: "City Council Regular Meeting",
    status: "Past",
    hasHtmlAgenda: true,
    hasPdf: true,
    sourceType: "HTML Agenda",
    sourceUrl: `https://fostercity.primegov.com/Portal/Meeting?meetingTemplateId=${templateId - 1}`,
    extractionNotes: [],
    llmInputText: title,
    publicCommentsInputText: null,
    items: [{
      externalId: "target-item",
      fileNumber: null,
      agendaNumber,
      itemType: null,
      title,
      action: null,
      result: null,
      sourceUrl: "https://fostercity.primegov.com/portal/item?meetingitemid=target-item",
      rowText: title
    }],
    documents: [{
      type: "Minutes",
      label: "Minutes",
      url: `https://fostercity.primegov.com/Public/CompiledDocument?meetingTemplateId=${templateId}&compileOutputType=1`,
      extractedText: minutes
    }]
  };
}

function extractFromFixture(meeting: LlmReadyMeeting) {
  return extractDecisionOutcome({
    id: "fixture-card",
    source_item_id: "target-item",
    agenda_item: meeting.items![0].title,
    source_url: meeting.sourceUrl
  }, meeting);
}

test("attributes the June 1 employment agreement to its own motion, not the preceding budget vote", () => {
  const result = extractFromFixture(fixtureMeeting(
    june1Minutes, employmentTitle, "9.1", "June 1, 2026", 7244
  ));
  assert.ok(result);
  assert.match(result.sourceText, /2026-057/);
  assert.match(result.sourceText, /3852/);
  assert.match(result.sourceText, /Jimenez/);
  assert.doesNotMatch(result.sourceContext, /2079|Preliminary Budget/i);
  assert.equal(result.kind, "approved");
  assert.equal(result.vote, "5–0–0");
});

test("still associates the neighboring preliminary-budget item with its own motion", () => {
  const result = extractFromFixture(fixtureMeeting(
    june1Minutes, "FY 2026-27 and FY 2027-28 preliminary budget", "8.1", "June 1, 2026", 7244
  ));
  assert.ok(result);
  assert.match(result.sourceText, /2079/);
  assert.doesNotMatch(result.sourceContext, /2026-057|Employment Agreement/i);
  assert.equal(result.kind, "approved");
  assert.equal(result.vote, "5–0–0");
  const employment = extractFromFixture(fixtureMeeting(
    june1Minutes, employmentTitle, "9.1", "June 1, 2026", 7244
  ));
  assert.notEqual(result.matchedItemKey, employment?.matchedItemKey);
});

test("does not borrow a neighboring vote when the matching minutes heading has no result", () => {
  const withoutEmploymentMotion = june1Minutes.replace(
    june1Minutes.split(/\n\s*\n/).find(
      (paragraph) => /^Motion by/.test(paragraph.trim()) && paragraph.includes("2026-057")
    )!,
    "Discussion only."
  );
  const result = extractFromFixture(fixtureMeeting(
    withoutEmploymentMotion, employmentTitle, "9.1", "June 1, 2026", 7244
  ));
  assert.equal(result, null);
});

test("preserves the utility-box motion after Minute Order No. including funding and signage", () => {
  assert.equal(extractResultText(artMotion), artMotion.replace(/\.$/, ""));
  const result = extractFromFixture(fixtureMeeting(
    may4Minutes, "Utility Box Art Pilot Program Update", "7.1", "May 4, 2026", 7232
  ));
  assert.ok(result);
  assert.match(result.sourceText, /2074/);
  assert.match(result.sourceText, /Community Benefit Fund/);
  assert.match(result.sourceText, /City-sponsored project/);
  assert.doesNotMatch(result.sourceContext, /2026-041|2026-042/);
  assert.equal(result.kind, "approved");
  assert.equal(result.vote, "5–0–0");
});

test("never assigns the utility-box vote to the preceding school-crossing agreement", () => {
  const result = extractFromFixture(fixtureMeeting(
    may4Minutes,
    "School crossing guard agreement with the San Mateo–Foster City School District for the 2026-2027 school year in the amount of $21,600",
    "6.3", "May 4, 2026", 7232
  ));
  // The source omits "carried" in this motion. Returning no match is acceptable;
  // returning the neighboring utility-box motion is not.
  if (result) {
    assert.match(result.sourceText, /2026-041/);
    assert.doesNotMatch(result.sourceContext, /2074|Utility Box/i);
  }
});

test("keeps a numbered motion separate from the following sentence and motion", () => {
  assert.equal(
    extractResultText(`${artMotion} The Council denied the next item.`),
    artMotion.replace(/\.$/, "")
  );
  assert.equal(extractResultText(budgetMotion), budgetMotion.replace(/\.$/, ""));
});

test("classifies adoption of an amended agreement by the recorded action outside its resolution title", () => {
  assert.equal(classifyDecisionOutcome(employmentMotion), "approved");
  assert.equal(classifyDecisionOutcome(cooperationMotion), "approved");
  assert.equal(classifyDecisionOutcome(cooperationMotion.replace(/[“”]/g, '"')), "approved");
  const result = interpretOfficialAction(null, cooperationMotion, {
    jurisdictionSlug: "foster-city", title: "City Council", meetingType: "City Council"
  });
  assert.equal(result.canonicalStatus, "approved");
  assert.equal(result.nextStep, null);
  assert.doesNotMatch(result.headline, /amend|continu/i);
});

test("extracts the cooperation agreement's approval without treating continued participation as a continuance", () => {
  const result = extractFromFixture(fixtureMeeting(
    june15Minutes, "Second amendment to the cooperation agreement", "6.6", "June 15, 2026", 7250
  ));
  assert.ok(result);
  assert.match(result.sourceText, /2026-066/);
  assert.match(result.sourceText, /Second Amendment/);
  assert.match(result.sourceText, /Continued Participation/);
  assert.equal(result.canonicalStatus, "approved");
  assert.equal(result.nextStep, null);
  assert.equal(result.vote, "5–0–0");
});

test("retains real amendments, continuances, and failures outside a quoted resolution title", () => {
  const resolution = '“A Resolution of the City Council Approving the Second Amendment for Continued Participation.”';
  assert.equal(classifyDecisionOutcome(`The Council adopted ${resolution} as amended.`), "amended");
  assert.equal(classifyDecisionOutcome(`The motion to adopt ${resolution} failed 2-3.`), "rejected");
  assert.equal(classifyDecisionOutcome(`The item, ${resolution}, was continued to July 1.`), "continued");
  assert.equal(classifyDecisionOutcome("AMENDED, AN AMENDMENT OF THE WHOLE | Pass"), "amended");
});
