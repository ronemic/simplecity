import assert from "node:assert/strict";
import test from "node:test";
import type { AgendaItem, SimpleCitySummary } from "@/lib/types";
import { attachSourceItemIds } from "@/lib/utils/cardSourceIdentity";
import { formatAgendaItemContexts } from "@/lib/scraper/agendaItemContext";

function item(externalId: string, title: string): AgendaItem {
  return {
    externalId,
    fileNumber: null,
    agendaNumber: null,
    itemType: "Resolution",
    title,
    action: "Approve",
    result: null,
    sourceUrl: "https://example.com/meeting",
    rowText: title
  };
}

function summary(agendaItem: string, sourceItemId: string | null = null): SimpleCitySummary {
  return {
    meetingSummary: {
      title: "City Council",
      date: "July 20, 2026",
      status: "Upcoming",
      oneSentenceSummary: "The council will meet."
    },
    cards: [
      {
        sourceItemId,
        agendaItem,
        whatIsHappening: ["The council will consider this item."],
        whyItMatters: "The decision affects residents.",
        whoItAffects: ["Residents"],
        categoryTags: ["City Services"],
        status: "Upcoming vote",
        commentWindow: { opens: "Not listed", closes: "Not listed" },
        howToAct: { attend: "Not listed", email: "Not listed", submitComment: "Not listed" },
        source: "https://example.com/meeting",
        confidence: "high"
      }
    ]
  };
}

test("agenda-item prompts expose stable machine-readable source ids", () => {
  const context = formatAgendaItemContexts([
    item("legistar-item-8130329-guid", "Affordable housing loan agreement")
  ]);
  assert.match(context, /Source item ID: legistar-item-8130329-guid/);
});

test("cards inherit a stable source id when the model omits it", () => {
  const result = attachSourceItemIds(
    { items: [item("item-housing", "Affordable housing loan agreement")] },
    summary("Approve affordable housing loan")
  );
  assert.equal(result.cards[0].sourceItemId, "item-housing");
});

test("a valid id echoed by the model remains authoritative", () => {
  const result = attachSourceItemIds(
    {
      items: [
        item("item-east", "Library renovation on East Avenue"),
        item("item-west", "Library renovation on West Avenue")
      ]
    },
    summary("Library renovation contract", "item-west")
  );
  assert.equal(result.cards[0].sourceItemId, "item-west");
});

test("a source id repeated within one meeting is not used as identity", () => {
  const duplicateItems = [
    item("duplicate-id", "Library renovation on East Avenue"),
    item("duplicate-id", "Library renovation on West Avenue")
  ];
  const result = attachSourceItemIds(
    { items: duplicateItems },
    summary("Library renovation on East Avenue", "duplicate-id")
  );
  assert.equal(result.cards[0].sourceItemId, null);
  assert.doesNotMatch(formatAgendaItemContexts(duplicateItems), /Source item ID: duplicate-id/);
});
