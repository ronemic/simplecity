import assert from "node:assert/strict";
import test from "node:test";
import {
  agendaItemsRequiringCards,
  completeAgendaItemCoverage,
  officialSourceFallbackSummary,
  uncoveredAgendaItems
} from "@/lib/llm/agendaItemCoverage";
import type { AgendaItem, LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";

function item(id: string, title: string): AgendaItem {
  return {
    externalId: id,
    fileNumber: null,
    agendaNumber: id,
    itemType: null,
    title,
    action: null,
    result: null,
    sourceUrl: `https://example.test/items/${id}`,
    rowText: title
  };
}

function meeting(items: AgendaItem[]): LlmReadyMeeting {
  return {
    id: "meeting-1",
    externalId: "meeting-1",
    section: "Upcoming Meetings",
    title: "Subdivision Committee Meeting",
    dateText: "August 10, 2026",
    meetingType: "Subdivision Committee",
    rowText: "Meeting",
    status: "Upcoming",
    sourceType: "CivicClerk",
    sourceUrl: "https://example.test/meeting",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [],
    items,
    extractionNotes: [],
    llmInputText: "Current meeting agenda items",
    publicCommentsInputText: null
  };
}

function emptySummary(): SimpleCitySummary {
  return {
    meetingSummary: {
      title: "Meeting",
      date: "August 10, 2026",
      status: "Upcoming",
      oneSentenceSummary: "Meeting"
    },
    cards: []
  };
}

test("requires cards for substantive official items but not routine meeting administration", () => {
  const source = meeting([
    item("1", "Call to Order"),
    item("2", "Approve Minutes"),
    item("3", "Lands of Smith subdivision application"),
    item("4", "Public Comment"),
    item("5", "Adjournment")
  ]);

  assert.deepEqual(
    agendaItemsRequiringCards(source).map((agendaItem) => agendaItem.externalId),
    ["3"]
  );
});

test("measures coverage by stable source item id instead of meeting card count", () => {
  const source = meeting([item("2A", "First application"), item("2B", "Second application")]);
  const summary = officialSourceFallbackSummary(source, [source.items![0]]);

  assert.deepEqual(
    uncoveredAgendaItems(source, summary).map((agendaItem) => agendaItem.externalId),
    ["2B"]
  );
});

test("retries only uncovered items and publishes an official-source fallback when retry stays empty", async () => {
  const source = meeting([item("2A", "First application"), item("2B", "Second application")]);
  const first = officialSourceFallbackSummary(source, [source.items![0]]);
  const retried: string[] = [];

  const completed = await completeAgendaItemCoverage(
    source,
    { summary: first, raw: { first: true } },
    {
      generate: async (retryMeeting) => {
        retried.push(retryMeeting.items![0].externalId);
        return { summary: emptySummary(), raw: { retry: true } };
      }
    }
  );

  assert.deepEqual(retried, ["2B"]);
  assert.deepEqual(completed.fallbackItemIds, ["2B"]);
  assert.deepEqual(completed.summary.cards.map((card) => card.sourceItemId), ["2A", "2B"]);
  assert.equal(completed.summary.cards[1].confidence, "low");
  assert.equal(completed.summary.translations?.es?.cards.length, 2);
});
