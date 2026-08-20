import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  appendSummaryCardsForMeeting,
  cardModelInputText,
  isAgendaUnavailablePlaceholderCard,
  obsoleteAuthoritativeSourceCardIds,
  SUMMARY_CARD_WRITE_BATCH_SIZE,
  rawLlmJsonForBulkRow,
  replaceSummaryCardsForMeeting,
  summaryCardWriteBatches
} from "@/lib/db/upsertMeetings";
import type { SimpleCityCard, SimpleCitySummary } from "@/lib/types";

const placeholderCleanupMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260721000000_delete_obsolete_agenda_placeholders.sql",
    import.meta.url
  ),
  "utf8"
);
const scopedLegacyIdentityMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260810000000_scope_summary_card_legacy_identity.sql",
    import.meta.url
  ),
  "utf8"
);
const fullBootstrapSchema = readFileSync(
  new URL("../supabase/bootstrap_full.sql", import.meta.url),
  "utf8"
);
const countyBootstrapSchema = readFileSync(
  new URL("../supabase/bootstrap_county.sql", import.meta.url),
  "utf8"
);

function card(index: number): SimpleCityCard {
  return {
    sourceItemId: `item-${index}`,
    agendaItem: `Agenda item ${index}`,
    whatIsHappening: [`The city will consider item ${index}.`],
    whyItMatters: "It affects city services.",
    whoItAffects: ["Residents"],
    categoryTags: ["Public Services"],
    status: "Vote scheduled",
    commentWindow: { opens: "Not listed", closes: "Not listed" },
    howToAct: {
      attend: "See the official agenda.",
      email: "Not listed",
      submitComment: "Not listed"
    },
    source: `https://example.test/items/${index}`,
    confidence: "high"
  };
}

function agendaUnavailableCard(): SimpleCityCard {
  return {
    ...card(0),
    sourceItemId: null,
    agendaItem: "Agenda not posted for Fairgrounds Board meeting",
    whatIsHappening: [
      "The meeting agenda is not available online yet. Check back later for the agenda."
    ],
    whyItMatters: "Residents cannot review the meeting topics until the agenda is posted."
  };
}

function summary(cardCount: number): SimpleCitySummary {
  return {
    meetingSummary: {
      title: "Large Board meeting",
      date: "July 21, 2026",
      status: "Upcoming",
      oneSentenceSummary: "The Board will consider a large agenda."
    },
    cards: Array.from({ length: cardCount }, (_, index) => card(index))
  };
}

test("splits large summary-card writes into bounded batches", () => {
  const rows = Array.from({ length: 82 }, (_, index) => index);
  const batches = summaryCardWriteBatches(rows);

  assert.equal(SUMMARY_CARD_WRITE_BATCH_SIZE, 20);
  assert.deepEqual(batches.map((batch) => batch.length), [20, 20, 20, 20, 2]);
  assert.deepEqual(batches.flat(), rows);
});

test("authoritative reconciliation removes stale identified cards but retains legacy cards", () => {
  const ids = obsoleteAuthoritativeSourceCardIds(
    [
      { id: "current", source_item_id: "legistar-event-item-2" },
      { id: "page-break", source_item_id: "legistar-event-item-1" },
      { id: "pdf-fragment", source_item_id: "santa-barbara-event-item-5-64" },
      {
        id: "reviewed",
        source_item_id: "retired-official-item",
        admin_notes: "Retain after staff review"
      },
      {
        id: "featured",
        source_item_id: "retired-featured-item",
        is_featured: true
      },
      { id: "legacy-cancellation", source_item_id: null }
    ],
    new Set(["legistar-event-item-2"])
  );

  assert.deepEqual(ids, ["page-break", "pdf-fragment"]);
  assert.deepEqual(
    obsoleteAuthoritativeSourceCardIds(
      [{ id: "untouched", source_item_id: "item-1" }],
      null
    ),
    []
  );
});

test("initial replacement persists only cards in a complete official item inventory", async () => {
  const insertedRows: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      if (table === "meetings") {
        return { update() { return { async eq() { return { error: null }; } }; } };
      }
      assert.equal(table, "summary_cards");
      return {
        select(columns: string) {
          if (columns === "source_item_id" || columns === "model_input_text") {
            return { async limit() { return { data: [], error: null }; } };
          }
          return { async eq() { return { data: [], error: null }; } };
        },
        delete() {
          return { async eq() { return { error: null }; } };
        },
        insert(rows: Array<Record<string, unknown>>) {
          insertedRows.push(...rows);
          return {
            async select() {
              return {
                data: rows.map((row, index) => ({
                  id: `persisted-${index}`,
                  source_item_id: row.source_item_id,
                  agenda_item: row.agenda_item,
                  source_url: row.source_url
                })),
                error: null
              };
            }
          };
        }
      };
    }
  };

  const persisted = await replaceSummaryCardsForMeeting(
    supabase as never,
    "meeting-authoritative",
    summary(2),
    { response: "summary" },
    {
      authoritativeSourceItemIds: ["item-1"],
      sourceHash: "authoritative-source-hash"
    }
  );

  assert.deepEqual(insertedRows.map((row) => row.source_item_id), ["item-1"]);
  assert.equal(persisted.length, 1);
});

test("stores one raw model payload for a bulk card write", () => {
  const raw = { simplecityItemBatches: [{ response: "large payload" }] };
  assert.equal(rawLlmJsonForBulkRow(raw, 0), raw);
  assert.equal(rawLlmJsonForBulkRow(raw, 1), null);
});

test("recognizes agenda-unavailable placeholder wording without matching real agenda cards", () => {
  assert.equal(isAgendaUnavailablePlaceholderCard(agendaUnavailableCard()), true);
  assert.equal(
    isAgendaUnavailablePlaceholderCard({
      agendaItem: "Board adopts the posted meeting agenda",
    }),
    false
  );
  const realCardWithHistoricalAvailabilityContext = {
    agendaItem: "Policy for publishing public notices",
    whatIsHappening: ["The prior meeting agenda was not available online."]
  };
  assert.equal(
    isAgendaUnavailablePlaceholderCard(realCardWithHistoricalAvailabilityContext),
    false
  );
  assert.equal(
    isAgendaUnavailablePlaceholderCard({
      agendaItem: "Agenda not posted discussion",
      sourceItemId: "official-item-1"
    }),
    false
  );
});

test("cleanup migration protects identified or curated cards and audits every deletion", () => {
  assert.match(placeholderCleanupMigration, /lower\(agenda_item\) as title/i);
  assert.match(placeholderCleanupMigration, /candidate\.source_item_id is null/i);
  assert.match(placeholderCleanupMigration, /candidate\.is_featured/i);
  assert.match(placeholderCleanupMigration, /candidate\.admin_notes/i);
  assert.match(placeholderCleanupMigration, /public\.decision_outcomes/i);
  assert.match(placeholderCleanupMigration, /insert into public\.admin_audit_log/i);
  assert.match(placeholderCleanupMigration, /to_jsonb\(deleted\)/i);
});

test("legacy title identity no longer blocks distinct source-identified cards", () => {
  assert.match(scopedLegacyIdentityMigration, /drop index if exists public\.summary_cards_regeneration_idx/i);
  assert.match(scopedLegacyIdentityMigration, /where source_item_id is null/i);
  assert.match(scopedLegacyIdentityMigration, /unique index/i);
  for (const bootstrap of [fullBootstrapSchema, countyBootstrapSchema]) {
    assert.match(
      bootstrap,
      /summary_cards_regeneration_idx[\s\S]*?where source_item_id is null/i
    );
  }
});

test("removes an obsolete agenda placeholder when real agenda cards are appended", async () => {
  const deletedIds: string[][] = [];
  const insertedRows: Array<Record<string, unknown>> = [];
  const meetingUpdates: Array<Record<string, unknown>> = [];
  const realCard = card(1);
  const summaryWithStalePlaceholder: SimpleCitySummary = {
    ...summary(0),
    cards: [agendaUnavailableCard(), realCard]
  };
  const supabase = {
    from(table: string) {
      if (table === "meetings") {
        return {
          update(values: Record<string, unknown>) {
            meetingUpdates.push(values);
            return {
              async eq() {
                return { error: null };
              }
            };
          }
        };
      }

      assert.equal(table, "summary_cards");
      return {
        select(columns: string) {
          if (columns === "source_item_id" || columns === "model_input_text") {
            return {
              async limit() {
                return { data: [], error: null };
              }
            };
          }

          return {
            async eq() {
              return {
                data: [
                  {
                    id: "placeholder-old",
                    source_item_id: null,
                    agenda_item: agendaUnavailableCard().agendaItem,
                    source_url: "https://example.test/meeting",
                    is_published: true,
                    is_featured: false,
                    admin_notes: null
                  },
                  {
                    id: "placeholder-official",
                    source_item_id: "official-item-1",
                    agenda_item: agendaUnavailableCard().agendaItem,
                    source_url: "https://example.test/items/official-item-1",
                    is_published: true,
                    is_featured: false,
                    admin_notes: null
                  },
                  {
                    id: "placeholder-reviewed",
                    source_item_id: null,
                    agenda_item: agendaUnavailableCard().agendaItem,
                    source_url: "https://example.test/reviewed",
                    is_published: true,
                    is_featured: false,
                    admin_notes: "Reviewed by an administrator"
                  },
                  {
                    id: "placeholder-featured",
                    source_item_id: null,
                    agenda_item: agendaUnavailableCard().agendaItem,
                    source_url: "https://example.test/featured",
                    is_published: true,
                    is_featured: true,
                    admin_notes: null
                  }
                ],
                error: null
              };
            }
          };
        },
        delete() {
          return {
            async in(column: string, ids: string[]) {
              assert.equal(column, "id");
              deletedIds.push(ids);
              return { error: null };
            }
          };
        },
        insert(rows: Array<Record<string, unknown>>) {
          insertedRows.push(...rows);
          return {
            async select() {
              return {
                data: rows.map((row, index) => ({
                  id: `new-${index}`,
                  source_item_id: row.source_item_id,
                  agenda_item: row.agenda_item,
                  source_url: row.source_url
                })),
                error: null
              };
            }
          };
        }
      };
    }
  };

  const persisted = await appendSummaryCardsForMeeting(
    supabase as never,
    "meeting-1",
    summaryWithStalePlaceholder,
    { response: "refreshed agenda" },
    { sourceHash: "new-source-hash" }
  );

  assert.deepEqual(deletedIds, [["placeholder-old"]]);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].agenda_item, realCard.agendaItem);
  assert.equal(persisted.length, 1);
  assert.equal(meetingUpdates[0].summarized_source_hash, "new-source-hash");
});

test("adopts a legacy exact-key card when appending a stable source item id", async () => {
  const updatedRows: Array<Record<string, unknown>> = [];
  const insertedRows: Array<Record<string, unknown>> = [];
  const meetingUpdates: Array<Record<string, unknown>> = [];
  const incomingCard = card(7);
  const legacyCard = {
    id: "legacy-card",
    source_item_id: null,
    agenda_item: incomingCard.agendaItem,
    source_url: incomingCard.source,
    is_published: false,
    is_featured: true,
    admin_notes: "Keep this review"
  };

  const supabase = {
    from(table: string) {
      if (table === "meetings") {
        return {
          update(values: Record<string, unknown>) {
            meetingUpdates.push(values);
            return { async eq() { return { error: null }; } };
          }
        };
      }

      assert.equal(table, "summary_cards");
      return {
        select(columns: string) {
          if (columns === "source_item_id" || columns === "model_input_text") {
            return { async limit() { return { data: [], error: null }; } };
          }
          return { async eq() { return { data: [legacyCard], error: null }; } };
        },
        update(values: Record<string, unknown>) {
          updatedRows.push(values);
          return {
            eq(column: string, value: string) {
              assert.equal(column, "id");
              assert.equal(value, legacyCard.id);
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: {
                          id: legacyCard.id,
                          source_item_id: values.source_item_id,
                          agenda_item: values.agenda_item,
                          source_url: values.source_url
                        },
                        error: null
                      };
                    }
                  };
                }
              };
            }
          };
        },
        insert(rows: Array<Record<string, unknown>>) {
          insertedRows.push(...rows);
          return { async select() { return { data: [], error: null }; } };
        }
      };
    }
  };

  const persisted = await appendSummaryCardsForMeeting(
    supabase as never,
    "meeting-legacy",
    { ...summary(0), cards: [incomingCard] },
    { response: "new summary" },
    { sourceHash: "legacy-upgraded" }
  );

  assert.equal(insertedRows.length, 0);
  assert.equal(updatedRows.length, 1);
  assert.equal(updatedRows[0].source_item_id, incomingCard.sourceItemId);
  assert.equal(updatedRows[0].is_published, false);
  assert.equal(updatedRows[0].is_featured, true);
  assert.equal(updatedRows[0].admin_notes, legacyCard.admin_notes);
  assert.equal(persisted[0].id, legacyCard.id);
  assert.equal(meetingUpdates[0].summarized_source_hash, "legacy-upgraded");
});

test("updates changed content on a uniquely matched legacy card before marking the source complete", async () => {
  const updatedRows: Array<Record<string, unknown>> = [];
  const insertedRows: Array<Record<string, unknown>> = [];
  const meetingUpdates: Array<Record<string, unknown>> = [];
  const incomingCard = {
    ...card(9),
    sourceItemId: null,
    whatIsHappening: ["The revised park contract costs $250."]
  };
  const legacyCard = {
    id: "legacy-without-source-id",
    source_item_id: null,
    agenda_item: incomingCard.agendaItem,
    source_url: incomingCard.source,
    is_published: true,
    is_featured: false,
    admin_notes: null
  };

  const supabase = {
    from(table: string) {
      if (table === "meetings") {
        return {
          update(values: Record<string, unknown>) {
            meetingUpdates.push(values);
            return { async eq() { return { error: null }; } };
          }
        };
      }

      assert.equal(table, "summary_cards");
      return {
        select(columns: string) {
          if (columns === "source_item_id" || columns === "model_input_text") {
            return { async limit() { return { data: [], error: null }; } };
          }
          return { async eq() { return { data: [legacyCard], error: null }; } };
        },
        update(values: Record<string, unknown>) {
          updatedRows.push(values);
          return {
            eq() {
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: {
                          id: legacyCard.id,
                          source_item_id: values.source_item_id,
                          agenda_item: values.agenda_item,
                          source_url: values.source_url
                        },
                        error: null
                      };
                    }
                  };
                }
              };
            }
          };
        },
        insert(rows: Array<Record<string, unknown>>) {
          insertedRows.push(...rows);
          return { async select() { return { data: [], error: null }; } };
        }
      };
    }
  };

  const persisted = await appendSummaryCardsForMeeting(
    supabase as never,
    "meeting-legacy-change",
    { ...summary(0), cards: [incomingCard] },
    { response: "updated summary" },
    { sourceHash: "new-source-hash" }
  );

  assert.equal(insertedRows.length, 0);
  assert.equal(updatedRows.length, 1);
  assert.equal(updatedRows[0].what_is_happening, incomingCard.whatIsHappening[0]);
  assert.equal(persisted[0].id, legacyCard.id);
  assert.equal(meetingUpdates[0].summarized_source_hash, "new-source-hash");
});

test("does not treat a shared meeting source URL as legacy card identity", async () => {
  const sharedSource = "https://example.test/meeting/agenda";
  const insertedRows: Array<Record<string, unknown>> = [];
  const incomingCards = [
    { ...card(10), sourceItemId: null, source: sharedSource },
    { ...card(11), sourceItemId: null, source: sharedSource }
  ];
  const existing = {
    id: "old-unrelated-card",
    source_item_id: null,
    agenda_item: "Approve the prior library contract",
    source_url: sharedSource,
    is_published: true,
    is_featured: false,
    admin_notes: null
  };

  const supabase = {
    from(table: string) {
      if (table === "meetings") {
        return { update() { return { async eq() { return { error: null }; } }; } };
      }
      assert.equal(table, "summary_cards");
      return {
        select(columns: string) {
          if (columns === "source_item_id" || columns === "model_input_text") {
            return { async limit() { return { data: [], error: null }; } };
          }
          return { async eq() { return { data: [existing], error: null }; } };
        },
        update() {
          throw new Error("A shared meeting URL must not update an unrelated card");
        },
        insert(rows: Array<Record<string, unknown>>) {
          insertedRows.push(...rows);
          return {
            async select() {
              return {
                data: rows.map((row, index) => ({
                  id: `inserted-${index}`,
                  source_item_id: row.source_item_id,
                  agenda_item: row.agenda_item,
                  source_url: row.source_url
                })),
                error: null
              };
            }
          };
        }
      };
    }
  };

  const persisted = await appendSummaryCardsForMeeting(
    supabase as never,
    "meeting-shared-source",
    { ...summary(0), cards: incomingCards },
    { response: "new cards" },
    { sourceHash: "shared-source-hash" }
  );

  assert.equal(insertedRows.length, 2);
  assert.deepEqual(
    insertedRows.map((row) => row.agenda_item),
    incomingCards.map((incoming) => incoming.agendaItem)
  );
  assert.equal(persisted.length, 2);
});

test("does not overwrite a modern card when a distinct source id has the same public title", async () => {
  const updatedIds: string[] = [];
  const insertedRows: Array<Record<string, unknown>> = [];
  const existing = {
    id: "existing-item-a",
    source_item_id: "item-a",
    agenda_item: "Neighborhood park maintenance contract",
    source_url: "https://example.test/meeting/agenda",
    is_published: true,
    is_featured: false,
    admin_notes: null
  };
  const incomingCards = [
    {
      ...card(20),
      sourceItemId: "item-a",
      agendaItem: existing.agenda_item,
      source: existing.source_url
    },
    {
      ...card(21),
      sourceItemId: "item-b",
      agendaItem: existing.agenda_item,
      source: existing.source_url
    }
  ];
  const supabase = {
    from(table: string) {
      if (table === "meetings") {
        return { update() { return { async eq() { return { error: null }; } }; } };
      }
      assert.equal(table, "summary_cards");
      return {
        select(columns: string) {
          if (columns === "source_item_id" || columns === "model_input_text") {
            return { async limit() { return { data: [], error: null }; } };
          }
          return { async eq() { return { data: [existing], error: null }; } };
        },
        update(values: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              updatedIds.push(id);
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: {
                          id,
                          source_item_id: values.source_item_id,
                          agenda_item: values.agenda_item,
                          source_url: values.source_url
                        },
                        error: null
                      };
                    }
                  };
                }
              };
            }
          };
        },
        insert(rows: Array<Record<string, unknown>>) {
          insertedRows.push(...rows);
          return {
            async select() {
              return {
                data: rows.map((row) => ({
                  id: "inserted-item-b",
                  source_item_id: row.source_item_id,
                  agenda_item: row.agenda_item,
                  source_url: row.source_url
                })),
                error: null
              };
            }
          };
        }
      };
    }
  };

  const persisted = await appendSummaryCardsForMeeting(
    supabase as never,
    "meeting-modern-identities",
    { ...summary(0), cards: incomingCards },
    { response: "two official items" },
    { sourceHash: "modern-identities-hash" }
  );

  assert.deepEqual(updatedIds, [existing.id]);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].source_item_id, "item-b");
  assert.equal(persisted.length, 2);
});

function appendClientForExisting(
  existingRows: Array<Record<string, unknown>>,
  updatedRows: Array<{ id: string; values: Record<string, unknown> }>,
  insertedRows: Array<Record<string, unknown>>
) {
  return {
    from(table: string) {
      if (table === "meetings") {
        return { update() { return { async eq() { return { error: null }; } }; } };
      }
      assert.equal(table, "summary_cards");
      return {
        select(columns: string) {
          if (columns === "source_item_id" || columns === "model_input_text") {
            return { async limit() { return { data: [], error: null }; } };
          }
          return { async eq() { return { data: existingRows, error: null }; } };
        },
        update(values: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              updatedRows.push({ id, values });
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: {
                          id,
                          source_item_id: values.source_item_id,
                          agenda_item: values.agenda_item,
                          source_url: values.source_url
                        },
                        error: null
                      };
                    }
                  };
                }
              };
            }
          };
        },
        insert(rows: Array<Record<string, unknown>>) {
          insertedRows.push(...rows);
          return {
            async select() {
              return {
                data: rows.map((row, index) => ({
                  id: `inserted-${index}`,
                  source_item_id: row.source_item_id,
                  agenda_item: row.agenda_item,
                  source_url: row.source_url
                })),
                error: null
              };
            }
          };
        }
      };
    }
  };
}

test("adopts an identified row when a regenerated card omits its source item id", async () => {
  const updatedRows: Array<{ id: string; values: Record<string, unknown> }> = [];
  const insertedRows: Array<Record<string, unknown>> = [];
  const existing = {
    id: "existing-jato",
    source_item_id: "legistar-item-8071665",
    agenda_item: "Lease for JATO Aviation office space",
    source_url: "https://example.test/meeting/agenda",
    is_published: true,
    is_featured: false,
    admin_notes: null
  };
  const incomingCards = [
    {
      ...card(30),
      sourceItemId: null,
      agendaItem: "Lease for JATO Aviation office space at San Carlos Airport",
      source: existing.source_url
    }
  ];

  const persisted = await appendSummaryCardsForMeeting(
    appendClientForExisting([existing], updatedRows, insertedRows) as never,
    "meeting-regenerated-without-id",
    { ...summary(0), cards: incomingCards },
    { response: "regenerated" },
    { sourceHash: "regenerated-hash" }
  );

  assert.equal(insertedRows.length, 0, "the regenerated card must not create a duplicate row");
  assert.deepEqual(updatedRows.map((row) => row.id), [existing.id]);
  assert.equal(
    updatedRows[0].values.source_item_id,
    existing.source_item_id,
    "adopting a row must preserve the identity it already carries"
  );
  assert.equal(
    updatedRows[0].values.agenda_item,
    incomingCards[0].agendaItem,
    "the adopted row takes the regenerated public copy"
  );
  assert.equal(persisted.length, 1);
});

test("keeps an unidentified card from stealing a row another card in the batch claims", async () => {
  const updatedRows: Array<{ id: string; values: Record<string, unknown> }> = [];
  const insertedRows: Array<Record<string, unknown>> = [];
  const existing = {
    id: "existing-claimed",
    source_item_id: "item-claimed",
    agenda_item: "Lease for JATO Aviation office space",
    source_url: "https://example.test/meeting/agenda",
    is_published: true,
    is_featured: false,
    admin_notes: null
  };
  const incomingCards = [
    {
      ...card(31),
      sourceItemId: null,
      agendaItem: "Lease for JATO Aviation office space at San Carlos Airport",
      source: existing.source_url
    },
    {
      ...card(32),
      sourceItemId: existing.source_item_id,
      agendaItem: existing.agenda_item,
      source: existing.source_url
    }
  ];

  await appendSummaryCardsForMeeting(
    appendClientForExisting([existing], updatedRows, insertedRows) as never,
    "meeting-contested-identity",
    { ...summary(0), cards: incomingCards },
    { response: "contested" },
    { sourceHash: "contested-hash" }
  );

  assert.deepEqual(
    updatedRows.map((row) => row.id),
    [existing.id],
    "the card that re-emitted the identity owns the row"
  );
  assert.equal(updatedRows[0].values.source_item_id, existing.source_item_id);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].agenda_item, incomingCards[0].agendaItem);
  assert.equal(insertedRows[0].source_item_id, null);
});

test("writes distinct Spanish translations for source-identified cards sharing a legacy key", async () => {
  const sharedTitle = "Neighborhood park maintenance contract";
  const sharedSource = "https://example.test/meeting/agenda";
  const incomingCards = ["translation-item-a", "translation-item-b"].map(
    (sourceItemId, index) => ({
      ...card(40 + index),
      sourceItemId,
      agendaItem: sharedTitle,
      source: sharedSource,
      whatIsHappening: [`The city will consider contract option ${index + 1}.`]
    })
  );
  const translatedSummary: SimpleCitySummary = {
    ...summary(0),
    cards: incomingCards,
    translations: {
      es: {
        cards: incomingCards.map((incoming, index) => ({
          agendaItem: `${incoming.agendaItem} — opción ${index + 1}`,
          whatIsHappening: [`La ciudad considerará la opción ${index + 1}.`],
          whyItMatters: "Afecta los servicios de la ciudad.",
          whoItAffects: ["Residentes"],
          status: "Votación programada",
          commentWindow: { opens: "No indicado", closes: "No indicado" },
          howToAct: {
            attend: "Consulta la agenda oficial.",
            email: "No indicado",
            submitComment: "No indicado"
          }
        }))
      }
    }
  };
  const translationRows: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      if (table === "meetings") {
        return { update() { return { async eq() { return { error: null }; } }; } };
      }
      if (table === "summary_card_translations") {
        return {
          async upsert(
            rows: Array<Record<string, unknown>>,
            options: { onConflict: string }
          ) {
            assert.equal(options.onConflict, "summary_card_id,locale");
            translationRows.push(...rows);
            return { error: null };
          }
        };
      }

      assert.equal(table, "summary_cards");
      return {
        select(columns: string) {
          if (columns === "source_item_id" || columns === "model_input_text") {
            return { async limit() { return { data: [], error: null }; } };
          }
          return { async eq() { return { data: [], error: null }; } };
        },
        delete() {
          return { async eq() { return { error: null }; } };
        },
        insert(rows: Array<Record<string, unknown>>) {
          return {
            async select() {
              return {
                data: rows.map((row) => ({
                  id: `persisted-${row.source_item_id}`,
                  source_item_id: row.source_item_id,
                  agenda_item: row.agenda_item,
                  source_url: row.source_url
                })),
                error: null
              };
            }
          };
        }
      };
    }
  };

  const persisted = await replaceSummaryCardsForMeeting(
    supabase as never,
    "meeting-translated-identities",
    translatedSummary,
    { response: "translated summary" },
    { sourceHash: "translated-identities-hash" }
  );

  assert.equal(persisted.length, 2);
  assert.equal(translationRows.length, 2);
  assert.equal(new Set(translationRows.map((row) => row.summary_card_id)).size, 2);
  assert.equal(
    new Set(translationRows.map((row) => `${row.summary_card_id}:${row.locale}`)).size,
    2
  );
  assert.deepEqual(
    translationRows.map((row) => row.summary_card_id),
    ["persisted-translation-item-a", "persisted-translation-item-b"]
  );
});

test("adopts one collapsed legacy row without dropping a second distinct source item", async () => {
  const updatedIds: string[] = [];
  const insertedRows: Array<Record<string, unknown>> = [];
  const existing = {
    id: "collapsed-legacy-row",
    source_item_id: null,
    agenda_item: "Neighborhood park maintenance contract",
    source_url: "https://example.test/meeting/agenda",
    is_published: true,
    is_featured: false,
    admin_notes: null
  };
  const incomingCards = ["item-a", "item-b"].map((sourceItemId, index) => ({
    ...card(30 + index),
    sourceItemId,
    agendaItem: existing.agenda_item,
    source: existing.source_url
  }));
  const supabase = {
    from(table: string) {
      if (table === "meetings") {
        return { update() { return { async eq() { return { error: null }; } }; } };
      }
      assert.equal(table, "summary_cards");
      return {
        select(columns: string) {
          if (columns === "source_item_id" || columns === "model_input_text") {
            return { async limit() { return { data: [], error: null }; } };
          }
          return { async eq() { return { data: [existing], error: null }; } };
        },
        update(values: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              updatedIds.push(id);
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: {
                          id,
                          source_item_id: values.source_item_id,
                          agenda_item: values.agenda_item,
                          source_url: values.source_url
                        },
                        error: null
                      };
                    }
                  };
                }
              };
            }
          };
        },
        insert(rows: Array<Record<string, unknown>>) {
          insertedRows.push(...rows);
          return {
            async select() {
              return {
                data: rows.map((row) => ({
                  id: "inserted-second-source-item",
                  source_item_id: row.source_item_id,
                  agenda_item: row.agenda_item,
                  source_url: row.source_url
                })),
                error: null
              };
            }
          };
        }
      };
    }
  };

  const persisted = await appendSummaryCardsForMeeting(
    supabase as never,
    "meeting-collapsed-legacy-row",
    { ...summary(0), cards: incomingCards },
    { response: "two recovered official items" },
    { sourceHash: "collapsed-legacy-reconciled" }
  );

  assert.deepEqual(updatedIds, [existing.id]);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].source_item_id, "item-b");
  assert.equal(persisted.length, 2);
});

test("persists a large meeting in batches and marks it summarized after all writes", async () => {
  const insertedBatches: Array<Array<Record<string, unknown>>> = [];
  const meetingUpdates: Array<Record<string, unknown>> = [];
  let insertedCount = 0;

  const supabase = {
    from(table: string) {
      if (table === "meetings") {
        return {
          update(values: Record<string, unknown>) {
            meetingUpdates.push(values);
            return {
              async eq() {
                return { error: null };
              }
            };
          }
        };
      }

      assert.equal(table, "summary_cards");
      return {
        select(columns: string) {
          if (columns === "source_item_id" || columns === "model_input_text") {
            return {
              async limit() {
                return { data: [], error: null };
              }
            };
          }

          return {
            async eq() {
              return { data: [], error: null };
            }
          };
        },
        delete() {
          return {
            async eq() {
              return { error: null };
            }
          };
        },
        insert(rows: Array<Record<string, unknown>>) {
          insertedBatches.push(rows);
          const firstId = insertedCount;
          insertedCount += rows.length;
          return {
            async select() {
              return {
                data: rows.map((row, index) => ({
                  id: `card-${firstId + index}`,
                  source_item_id: row.source_item_id,
                  agenda_item: row.agenda_item,
                  source_url: row.source_url
                })),
                error: null
              };
            }
          };
        }
      };
    }
  };

  const raw = { simplecityItemBatches: [{ response: "large payload" }] };
  const inserted = await replaceSummaryCardsForMeeting(
    supabase as never,
    "meeting-1",
    summary(82),
    raw,
    { sourceHash: "source-hash" }
  );

  assert.deepEqual(insertedBatches.map((batch) => batch.length), [20, 20, 20, 20, 2]);
  assert.equal(inserted.length, 82);
  const storedRawPayloads = insertedBatches
    .flat()
    .map((row) => row.raw_llm_json)
    .filter((value) => value !== null);
  assert.equal(storedRawPayloads.length, 1);
  assert.deepEqual(storedRawPayloads[0], raw);
  assert.equal(
    insertedBatches.flat().filter((row) => row.raw_llm_json === null).length,
    81
  );
  assert.equal(meetingUpdates.length, 1);
  assert.equal(meetingUpdates[0].summarized_source_hash, "source-hash");
  assert.equal(typeof meetingUpdates[0].cards_generated_at, "string");
});


const provenanceItems = [
  {
    externalId: "item-7",
    fileNumber: null,
    agendaNumber: "7A",
    itemType: "CONSENT CALENDAR",
    title: "Amendment No. 2 with Thermal Mechanical Inc. for citywide HVAC repair",
    action: "Authorize the Mayor to execute the amendment",
    result: null,
    sourceUrl: "https://example.gov/item7",
    rowText: "Staff recommends a $50,000 amendment not to exceed $200,000 annually.",
    recommendedAction: null
  },
  {
    externalId: "item-8",
    fileNumber: null,
    agendaNumber: "8",
    itemType: "CONSENT CALENDAR",
    title: "Accept the quarterly investment report",
    action: null,
    result: null,
    sourceUrl: "https://example.gov/item8",
    rowText: "Quarterly investment report for the period ending June 30.",
    recommendedAction: null
  }
] as unknown as Parameters<typeof cardModelInputText>[1];

function provenanceCard(overrides: Partial<SimpleCityCard>) {
  return {
    sourceItemId: null,
    agendaItem: "A card",
    whatIsHappening: ["Something happens."],
    whyItMatters: "It matters.",
    whoItAffects: [],
    categoryTags: [],
    status: "Upcoming vote",
    commentWindow: { opens: "", closes: "" },
    howToAct: { attend: "", email: "", submitComment: "" },
    source: "https://example.gov/item7",
    confidence: "medium",
    ...overrides
  } as SimpleCityCard;
}

test("card provenance captures only the matched agenda item's context", () => {
  const text = cardModelInputText(
    provenanceCard({ sourceItemId: "item-7", agendaItem: "Approve $50,000 HVAC contract amendment" }),
    provenanceItems,
    true
  );
  assert.match(String(text), /Thermal Mechanical/);
  assert.match(String(text), /not to exceed \$200,000/);
  // A neighbouring item must not leak in, or cross-item contamination becomes invisible.
  assert.ok(!String(text).includes("quarterly investment report"));
});

test("card provenance is omitted entirely when the column is absent", () => {
  assert.equal(
    cardModelInputText(provenanceCard({ sourceItemId: "item-7" }), provenanceItems, false),
    undefined
  );
});

test("card provenance is null when no agenda item matches", () => {
  assert.equal(
    cardModelInputText(
      provenanceCard({ sourceItemId: "not-present", agendaItem: "An unrelated rezoning" }),
      provenanceItems,
      true
    ),
    null
  );
  assert.equal(cardModelInputText(provenanceCard({}), undefined, true), null);
});
