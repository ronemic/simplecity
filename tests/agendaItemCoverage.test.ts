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

test("school-district fallback cards infer a school-specific topic", () => {
  const source = {
    ...meeting([item("6.2", "Playground asphalt repairs at Oak School")]),
    jurisdictionSlug: "los-altos-school-district"
  };

  const summary = officialSourceFallbackSummary(source, source.items!);

  assert.deepEqual(summary.cards[0].categoryTags, ["School Buildings & Grounds"]);
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

  assert.deepEqual(retried, ["2B", "2B"]);
  assert.deepEqual(completed.fallbackItemIds, ["2B"]);
  assert.deepEqual(completed.summary.cards.map((card) => card.sourceItemId), ["2A", "2B"]);
  assert.equal(completed.summary.cards[1].confidence, "low");
  assert.equal(completed.fallbackReasons["2B"], "summary_omitted");
  assert.equal(completed.summary.translations?.es?.cards.length, 2);
});

test("labels fallback items whose generated cards failed validation", async () => {
  const source = meeting([item("7B", "Library roof replacement contract")]);
  const rejectedRaw = {
    simplecityValidation: {
      issues: [{ outcome: "reject", reason: "Unsupported value" }]
    }
  };

  const completed = await completeAgendaItemCoverage(
    source,
    { summary: emptySummary(), raw: rejectedRaw },
    {
      generate: async () => ({ summary: emptySummary(), raw: rejectedRaw })
    }
  );

  assert.equal(completed.fallbackReasons["7B"], "validation_failed");
  assert.equal(
    completed.summary.cards[0].whyItMatters,
    "SimpleCity could not verify a generated summary for this item. The official agenda text is shown instead."
  );
  assert.deepEqual(completed.summary.cards[0].whatIsHappening, [
    "Library roof replacement contract"
  ]);
});

test("labels fallback items when summary generation failed", async () => {
  const source = meeting([item("7B", "Library roof replacement contract")]);

  const completed = await completeAgendaItemCoverage(source, null, {
    initialGenerationFailed: true
  });

  assert.equal(completed.fallbackReasons["7B"], "generation_failed");
  assert.equal(
    completed.summary.cards[0].whyItMatters,
    "SimpleCity could not generate a summary for this item. The official agenda text is shown instead."
  );
});

test("retries residual omitted items in one bounded small batch before using fallbacks", async () => {
  const source = meeting([
    item("4A", "First application"),
    item("4B", "Second application"),
    item("4C", "Third application")
  ]);
  const generatedItemGroups: string[][] = [];

  const completed = await completeAgendaItemCoverage(source, null, {
    generate: async (retryMeeting) => {
      generatedItemGroups.push(retryMeeting.items!.map((agendaItem) => agendaItem.externalId));
      if (generatedItemGroups.length > 1) {
        return { summary: emptySummary(), raw: { residual: true } };
      }
      return {
        summary: officialSourceFallbackSummary(retryMeeting, retryMeeting.items!.slice(0, 2)),
        raw: { recovered: true }
      };
    }
  });

  assert.deepEqual(generatedItemGroups, [["4A", "4B", "4C"], ["4C"]]);
  assert.deepEqual(completed.retriedItemIds, ["4A", "4B", "4C"]);
  assert.deepEqual(completed.fallbackItemIds, ["4C"]);
  assert.deepEqual(completed.summary.cards.map((card) => card.sourceItemId), ["4A", "4B", "4C"]);
});
