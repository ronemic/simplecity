import assert from "node:assert/strict";
import test from "node:test";
import type { AgendaItem } from "@/lib/types";
import { planDuplicateCardRepair } from "@/lib/db/duplicateCardRepair";

function item(externalId: string, title: string): AgendaItem {
  return {
    externalId,
    fileNumber: null,
    agendaNumber: null,
    itemType: null,
    title,
    action: null,
    result: null,
    sourceUrl: "https://example.com/meeting",
    rowText: title
  };
}

test("duplicate repair keeps the newest wording and moves the existing outcome", () => {
  const plan = planDuplicateCardRepair(
    [
      {
        id: "old",
        agenda_item: "Approve affordable housing loan agreement",
        source_url: "https://example.com/meeting",
        created_at: "2026-07-10T00:00:00Z"
      },
      {
        id: "new",
        agenda_item: "Affordable housing loan approval",
        source_url: "https://example.com/meeting",
        created_at: "2026-07-18T00:00:00Z"
      }
    ],
    [item("housing-item", "Approve affordable housing loan agreement")],
    new Set(["old"])
  );

  assert.deepEqual(plan.groups, [
    {
      sourceItemId: "housing-item",
      survivorCardId: "new",
      duplicateCardIds: ["old"],
      outcomeCardId: "old",
      matchedCardIds: ["old", "new"]
    }
  ]);
});

test("duplicate repair refuses a source item with multiple outcomes", () => {
  const plan = planDuplicateCardRepair(
    [
      {
        id: "one",
        source_item_id: "item-1",
        agenda_item: "Contract approval",
        source_url: null,
        created_at: null
      },
      {
        id: "two",
        source_item_id: "item-1",
        agenda_item: "Approve contract",
        source_url: null,
        created_at: null
      }
    ],
    [item("item-1", "Approve contract")],
    new Set(["one", "two"])
  );

  assert.deepEqual(plan.groups, []);
  assert.deepEqual(plan.ambiguousSourceItemIds, ["item-1"]);
});

test("duplicate repair leaves non-unique official source ids untouched", () => {
  const plan = planDuplicateCardRepair(
    [
      {
        id: "card-east",
        source_item_id: "duplicate-id",
        agenda_item: "Library renovation on East Avenue",
        source_url: null,
        created_at: null
      }
    ],
    [
      item("duplicate-id", "Library renovation on East Avenue"),
      item("duplicate-id", "Library renovation on West Avenue")
    ],
    new Set()
  );

  assert.deepEqual(plan.groups, []);
  assert.deepEqual(plan.unmatchedCardIds, ["card-east"]);
});
