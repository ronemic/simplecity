import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DECISION_CARD_PAGE_SIZE } from "@/lib/constants";
import type { SummaryCardRow } from "@/lib/types";
import { compareCardsByDecisionOrder } from "@/lib/utils/decisionOrder";
import { matchesDecisionFilters } from "@/lib/utils/decisionFilters";

function card(
  id: string,
  agendaItem: string,
  decisionSortAt: string,
  isFeatured = false
): SummaryCardRow {
  return {
    id,
    meeting_id: null,
    jurisdiction_name: "Example City",
    jurisdiction_slug: "foster-city",
    platform: "primegov",
    agenda_item: agendaItem,
    what_is_happening: [agendaItem],
    why_it_matters: "Resident impact",
    who_it_affects: ["Residents"],
    category_tags: ["Transportation"],
    status: "Upcoming vote",
    comment_window_opens: null,
    comment_window_closes: null,
    how_to_act_attend: null,
    how_to_act_email: null,
    how_to_act_submit_comment: null,
    source_url: null,
    confidence: "high",
    is_published: true,
    is_featured: isFeatured,
    admin_notes: null,
    decision_sort_at: decisionSortAt,
    created_at: decisionSortAt,
    updated_at: decisionSortAt
  };
}

test("decision search filters without reordering matching cards", () => {
  const newestRoad = card("newest-road", "Repair the main road", "2026-07-16T12:00:00Z");
  const unrelated = card("unrelated", "Library hours", "2026-07-15T12:00:00Z");
  const olderRoad = card("older-road", "Resurface an older road", "2026-07-14T12:00:00Z");
  const ordered = [olderRoad, unrelated, newestRoad].sort(compareCardsByDecisionOrder);

  assert.deepEqual(
    ordered.filter((row) => matchesDecisionFilters(row, "road")).map((row) => row.id),
    ["newest-road", "older-road"]
  );
});

test("decision ordering is deterministic for pagination ties", () => {
  const first = card("aaa", "Road A", "2026-07-16T12:00:00Z");
  const second = card("bbb", "Road B", "2026-07-16T12:00:00Z");

  assert.deepEqual([first, second].sort(compareCardsByDecisionOrder).map((row) => row.id), [
    "bbb",
    "aaa"
  ]);
});

test("decisions use bounded server pagination with a database sort key", () => {
  const page = readFileSync(new URL("../app/decisions/page.tsx", import.meta.url), "utf8");
  const browser = readFileSync(new URL("../components/DecisionBrowser.tsx", import.meta.url), "utf8");
  const queries = readFileSync(new URL("../lib/db/queries.ts", import.meta.url), "utf8");
  const migration = readFileSync(
    new URL("../supabase/migrations/20260716010000_add_decision_sort_key.sql", import.meta.url),
    "utf8"
  );

  assert.match(page, /getDecisionCardPage/);
  assert.doesNotMatch(page, /getPublishedDecisionCards/);
  assert.doesNotMatch(browser, /matchesDecisionFilters|\.slice\(/);
  assert.match(browser, /Updating results/);
  assert.match(browser, /Actualizando resultados/);
  assert.match(queries, /\.order\("decision_sort_at"/);
  assert.match(queries, /\.range\(range\.from, range\.to\)/);
  assert.match(migration, /summary_cards_decision_page_idx/);
  assert.match(migration, /sync_meeting_decision_sort_at/);
  assert.equal(DECISION_CARD_PAGE_SIZE, 12);
});
