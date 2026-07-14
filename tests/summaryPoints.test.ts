import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { summaryCardTranslationFingerprint } from "@/lib/db/translationFingerprint";
import {
  normalizeSummaryPoints,
  summaryPointsFromLines,
  summaryPointsStorageText,
  summaryPointsText
} from "@/lib/utils/summaryPoints";

test("normalizes structured points without splitting their punctuation", () => {
  assert.deepEqual(
    normalizeSummaryPoints([
      "  Smith v. City of Los Altos. Residents may attend.  ",
      "Jan. 15 at 6:30 p.m. in the U.S. District Court."
    ]),
    [
      "Smith v. City of Los Altos. Residents may attend.",
      "Jan. 15 at 6:30 p.m. in the U.S. District Court."
    ]
  );
});

test("parses admin textarea lines and preserves excess points for API rejection", () => {
  assert.deepEqual(
    summaryPointsFromLines(" One. \n\n Two.\nThree.\nFour."),
    ["One.", "Two.", "Three.", "Four."]
  );
});

test("joins structured points for previews, search, sharing, and email", () => {
  assert.equal(summaryPointsText(["First point.", "Second point."]), "First point. Second point.");
  assert.equal(summaryPointsText(null), "");
});

test("stores structured points in the compatibility text column one per line", () => {
  const stored = summaryPointsStorageText(["First point.", "Second point."]);
  assert.equal(stored, "First point.\nSecond point.");
  assert.deepEqual(normalizeSummaryPoints(stored), ["First point.", "Second point."]);
});

test("translation fingerprints are stable across array and compatibility storage forms", () => {
  const base = {
    agenda_item: "Approve contract",
    why_it_matters: "It funds services.",
    who_it_affects: ["residents"],
    status: "Upcoming vote",
    comment_window_opens: "Not listed",
    comment_window_closes: "Not listed",
    how_to_act_attend: "Attend the meeting.",
    how_to_act_email: "Not listed",
    how_to_act_submit_comment: "Not listed"
  };

  assert.equal(
    summaryCardTranslationFingerprint({
      ...base,
      what_is_happening: ["First point.", "Second point."]
    }),
    summaryCardTranslationFingerprint({
      ...base,
      what_is_happening: "First point.\nSecond point."
    })
  );
});

test("migration expands the schema without changing or removing the legacy text column", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20260714000000_structure_what_is_happening_points.sql", import.meta.url),
    "utf8"
  );

  assert.match(sql, /add column if not exists what_is_happening_points text\[\]/g);
  assert.match(sql, /summary_points_from_text/);
  assert.match(sql, /sync_summary_card_points/);
  assert.match(sql, /sync_summary_card_translation_points/);
  assert.match(sql, /cardinality\(what_is_happening_points\) between 1 and 3/g);
  assert.match(sql, /gin\(what_is_happening gin_trgm_ops\)/);
  assert.match(sql, /Unknown legacy formatting is preserved as one point/);
  assert.doesNotMatch(sql, /alter column what_is_happening type/i);
  assert.doesNotMatch(sql, /drop column what_is_happening/i);
});

test("the first application deploy does not require the expanded database schema", () => {
  const queries = readFileSync(new URL("../lib/db/queries.ts", import.meta.url), "utf8");
  const decisionFilters = readFileSync(new URL("../lib/utils/decisionFilters.ts", import.meta.url), "utf8");
  const upserts = readFileSync(new URL("../lib/db/upsertMeetings.ts", import.meta.url), "utf8");
  const adminRoute = readFileSync(new URL("../app/api/admin/cards/route.ts", import.meta.url), "utf8");
  const decisionSearch = `${queries}\n${decisionFilters}`;

  assert.match(decisionSearch, /what_is_happening\.ilike/);
  assert.doesNotMatch(decisionSearch, /what_is_happening_points\.ilike|what_is_happening_search\.ilike/);
  assert.match(upserts, /what_is_happening: summaryPointsStorageText\(card\.whatIsHappening\)/);
  assert.match(adminRoute, /what_is_happening: summaryPointsStorageText\(update\.what_is_happening\)/);
});

test("decision search only caches its bounded page result", () => {
  const queries = readFileSync(new URL("../lib/db/queries.ts", import.meta.url), "utf8");

  assert.match(queries, /loadPublishedCardsForSelection\(selection, locale\)/);
  assert.doesNotMatch(queries, /getCachedPublishedCards\(/);
  assert.doesNotMatch(queries, /\["published-summary-cards"\]/);
  assert.match(queries, /\["decision-card-page-rendered-search-v5"\]/);
});
