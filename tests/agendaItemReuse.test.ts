import assert from "node:assert/strict";
import test from "node:test";
import { agendaItemInputHash, selectAgendaItemsForGeneration, withAgendaItemInputHash } from "@/lib/llm/agendaItemReuse";
import { completeAgendaItemCoverage, officialSourceFallbackSummary } from "@/lib/llm/agendaItemCoverage";
import { formatAgendaItemContexts, MEETING_WIDE_CONTEXT_HEADING, STRUCTURED_AGENDA_ITEMS_HEADING } from "@/lib/scraper/agendaItemContext";
import { meetingSummarySourceHash } from "@/lib/db/meetingSourceHash";
import type { AgendaItem, LlmReadyMeeting } from "@/lib/types";

function fixture(): LlmReadyMeeting {
  const items: AgendaItem[] = ["1", "2"].map((id) => ({
    externalId: id, fileNumber: null, agendaNumber: id, itemType: null,
    title: `Approve park improvement contract ${id}`, action: null, result: null,
    sourceUrl: `https://example.test/items/${id}`, rowText: `Approve park improvement contract ${id} for $100,000.`
  }));
  return {
    id: "meeting", section: "Upcoming Meetings", title: "City Council", dateText: "September 7, 2026",
    meetingType: "City Council", rowText: "Council", status: "Upcoming", sourceType: "Agenda PDF",
    sourceUrl: "https://example.test/meeting", hasHtmlAgenda: false, hasPdf: true,
    documents: [{ type: "Agenda", label: "Propose future agenda items.", url: "https://example.test/Detail_Motion.aspx?ID=1", extractedText: "Site navigation" }],
    items, extractionNotes: [], publicCommentsInputText: null,
    llmInputText: `${STRUCTURED_AGENDA_ITEMS_HEADING}\n${formatAgendaItemContexts(items)}\n${MEETING_WIDE_CONTEXT_HEADING}\nAttend at City Hall.`
  };
}
function saved(meeting: LlmReadyMeeting) {
  return meeting.items!.map((item) => ({
    source_item_id: item.externalId,
    model_input_text: formatAgendaItemContexts([item]),
    raw_llm_json: withAgendaItemInputHash(null, agendaItemInputHash(meeting, item))
  }));
}

test("document chrome invalidation selects no existing items and makes no recovery requests", async () => {
  const before = fixture();
  const after = structuredClone(before);
  after.documents[0].extractedText += " New sitewide legal notice";
  after.extractionNotes.push("Downloaded agenda again");
  assert.notEqual(meetingSummarySourceHash(before), meetingSummarySourceHash(after));
  const selection = selectAgendaItemsForGeneration(after, saved(before));
  assert.deepEqual(selection.retainedItemIds, ["1", "2"]);
  assert.equal(selection.meeting.items!.length, 0);
  assert.equal(selection.inputHashes.size, 0);
  let requests = 0;
  const coverage = await completeAgendaItemCoverage(selection.meeting, null, {
    generate: async () => { requests++; throw new Error("Unexpected request"); }
  });
  assert.equal(requests, 0);
  assert.deepEqual(coverage.summary.cards, []);
});

test("one changed item restricts generation and recovery to that item", async () => {
  const before = fixture();
  const after = structuredClone(before);
  after.items![1].rowText += " Revised contract amount: $200,000.";
  const selection = selectAgendaItemsForGeneration(after, saved(before));
  assert.deepEqual(selection.meeting.items!.map((item) => item.externalId), ["2"]);
  assert.deepEqual(selection.retainedItemIds, ["1"]);
  assert.deepEqual([...selection.inputHashes.keys()], ["2"]);
  const requests: string[][] = [];
  const coverage = await completeAgendaItemCoverage(selection.meeting, null, {
    generate: async (meeting) => {
      requests.push(meeting.items!.map((item) => item.externalId));
      return { summary: officialSourceFallbackSummary(meeting, meeting.items!), raw: {} };
    }
  });
  assert.deepEqual(requests, [["2"]]);
  assert.deepEqual(coverage.summary.cards.map((card) => card.sourceItemId), ["2"]);
});

test("missing cards are selected even when unrelated rows inflate the card count", () => {
  const meeting = fixture();
  const cards = saved(meeting).slice(0, 1);
  cards.push({ ...cards[0], source_item_id: "obsolete" });
  assert.deepEqual(selectAgendaItemsForGeneration(meeting, cards).meeting.items!.map((item) => item.externalId), ["2"]);
});

test("shared attendance or meeting time changes invalidate existing cards", () => {
  const before = fixture();
  for (const after of [
    { ...before, timeText: "7:00 PM" },
    { ...before, llmInputText: before.llmInputText.replace("City Hall", "Community Center") }
  ]) {
    assert.equal(selectAgendaItemsForGeneration(after, saved(before)).meeting.items!.length, 2);
  }
});

test("past status and separately reconciled outcome fields do not regenerate agenda explanations", () => {
  const before = fixture();
  const after = structuredClone(before);
  after.status = "Past";
  after.items![0].result = "Passed";
  assert.equal(selectAgendaItemsForGeneration(after, saved(before)).meeting.items!.length, 0);
});

test("legacy reuse requires exact item text and a completed shared context baseline", () => {
  const meeting = fixture();
  const cards = saved(meeting).map((card) => ({ ...card, raw_llm_json: null }));
  assert.equal(selectAgendaItemsForGeneration(meeting, cards, meeting).meeting.items!.length, 0);
  assert.equal(selectAgendaItemsForGeneration(meeting, cards, null).meeting.items!.length, 2);
  assert.equal(selectAgendaItemsForGeneration(meeting, cards, { ...meeting, timeText: "old time" }).meeting.items!.length, 2);
  cards[0].model_input_text += " Old source difference";
  assert.deepEqual(selectAgendaItemsForGeneration(meeting, cards, meeting).retainedItemIds, ["2"]);
});

test("ambiguous IDs and missing provenance are not treated as unchanged", () => {
  const meeting = fixture();
  const cards = saved(meeting);
  assert.deepEqual(selectAgendaItemsForGeneration(meeting, [...cards, cards[0]]).retainedItemIds, ["2"]);
  assert.equal(selectAgendaItemsForGeneration(meeting, cards.map((card) => ({ source_item_id: card.source_item_id }))).meeting.items!.length, 2);
});

test("each card gets a fingerprint without duplicating the model response", () => {
  assert.deepEqual(withAgendaItemInputHash(null, "hash"), { response: null, _simplecitySourceInputHash: "hash" });
  assert.deepEqual(withAgendaItemInputHash({ primarySummary: "response" }, "hash"), { primarySummary: "response", _simplecitySourceInputHash: "hash" });
});
