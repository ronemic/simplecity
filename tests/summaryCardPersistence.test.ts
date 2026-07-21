import assert from "node:assert/strict";
import test from "node:test";
import {
  SUMMARY_CARD_WRITE_BATCH_SIZE,
  rawLlmJsonForBulkRow,
  replaceSummaryCardsForMeeting,
  summaryCardWriteBatches
} from "@/lib/db/upsertMeetings";
import type { SimpleCityCard, SimpleCitySummary } from "@/lib/types";

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
