import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  appendSummaryCardsForMeeting,
  isAgendaUnavailablePlaceholderCard,
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
          if (columns === "source_item_id") {
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
          if (columns === "source_item_id") {
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
          if (columns === "source_item_id") {
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
