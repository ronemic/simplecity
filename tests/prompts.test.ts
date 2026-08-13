import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSimpleCityUserPrompt,
  SIMPLECITY_SYSTEM_PROMPT
} from "@/lib/llm/prompts";
import type { LlmReadyMeeting } from "@/lib/types";

test("summarizer prompt includes transparency-worthy routine items", () => {
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Include transparency routine cards/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /approval of minutes/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Consent calendar summary/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /public comment periods/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /closed session items/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Include continuances and special meeting notices/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Cancelled meetings are filtered before this prompt/);
  assert.match(
    SIMPLECITY_SYSTEM_PROMPT,
    /If no non-routine or transparency-worthy source-supported agenda items are visible/
  );
});

test("summarizer prompt requires structured and aligned summary points", () => {
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /whatIsHappening” must be an array of 1-3/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Never combine the points into one string/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /same number of points as its matching English card/);
});

test("summarizer prompt classifies topics from complete item context", () => {
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /agenda item's complete context/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Do not choose a topic from an isolated keyword/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Choose exactly one primary topic/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /no more than two topics/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Classify a work plan by the substantive service area/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /service charge, revenue, or tax-roll collection/);
});

test("summarizer prompt separates item status from participation and historical minutes", () => {
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Public comment availability and item status are independent/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /prior meeting minutes, historical vote results/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Never mark a current agenda item “Passed” or “Tabled”/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Consider every action requested of the current body/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /a substantive formal decision outranks discussion/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /consider adoption/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Use “Routine approval” only for approval of meeting minutes/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Do not use it for a substantive contract, budget, permit/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /even if the agenda does not mention a roll-call vote/);
});

test("decision-card prompts exclude submitted public-comment bodies", () => {
  const meeting: LlmReadyMeeting = {
    id: "meeting-1",
    section: "Upcoming Meetings",
    title: "Council Meeting",
    dateText: "June 13, 2026",
    meetingType: "City Council",
    rowText: "",
    status: "Upcoming",
    sourceType: "Agenda PDF",
    sourceUrl: "https://city.example/agenda",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [],
    extractionNotes: [],
    llmInputText: "Official agenda item text.",
    publicCommentsInputText: "PUBLIC_COMMENT_BODY_SENTINEL"
  };

  const prompt = buildSimpleCityUserPrompt(meeting);
  assert.match(prompt, /Official agenda item text/);
  assert.doesNotMatch(prompt, /PUBLIC_COMMENT_BODY_SENTINEL/);
  assert.doesNotMatch(SIMPLECITY_SYSTEM_PROMPT, /optional public-comment text/i);
});

test("LASD prompts distinguish school-board decisions and protect sensitive details", () => {
  const meeting: LlmReadyMeeting = {
    id: "lasd-meeting",
    jurisdictionSlug: "los-altos-school-district",
    section: "Upcoming Meetings",
    title: "Regular Meeting of the Board of Trustees",
    dateText: "August 17, 2026",
    meetingType: "Board of Trustees",
    rowText: "",
    status: "Upcoming",
    sourceType: "Simbli agenda",
    sourceUrl: "https://simbli.example/meeting",
    hasHtmlAgenda: true,
    hasPdf: false,
    documents: [],
    extractionNotes: [],
    llmInputText: "Official agenda item text.",
    publicCommentsInputText: null
  };

  const prompt = buildSimpleCityUserPrompt(meeting);
  assert.match(prompt, /public school district, not a city government/);
  assert.match(prompt, /Use only these school-district topics/);
  assert.match(prompt, /School Buildings & Grounds/);
  assert.match(prompt, /Board & Administration only when governance or administration is the actual subject/);
  assert.match(prompt, /playground, field, landscaping project, or grounds repair is School Buildings & Grounds/);
  assert.match(prompt, /curriculum, student services, facilities/);
  assert.match(prompt, /committee recommendation is advice/);
  assert.match(prompt, /confidential student, discipline, special-education/);
  assert.match(prompt, /Virtual viewing does not imply virtual public comment/);
});
