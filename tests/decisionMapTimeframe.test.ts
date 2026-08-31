import assert from "node:assert/strict";
import test from "node:test";
import {
  decisionMapCutoff,
  normalizeDecisionMapTimeframe
} from "@/lib/maps/timeframe";

test("decision maps default to the last twelve months", () => {
  assert.equal(normalizeDecisionMapTimeframe(undefined), "12m");
  assert.equal(normalizeDecisionMapTimeframe("unexpected"), "12m");
  assert.equal(
    decisionMapCutoff("12m", new Date("2026-08-29T12:00:00.000Z")),
    "2025-08-29T12:00:00.000Z"
  );
});

test("decision maps support a shorter window and explicit all-history mode", () => {
  assert.equal(
    decisionMapCutoff("3m", new Date("2026-08-29T12:00:00.000Z")),
    "2026-05-29T12:00:00.000Z"
  );
  assert.equal(decisionMapCutoff("all"), null);
});

test("month-end cutoffs never roll forward past the intended month", () => {
  // May 31 minus three months is Feb 31, which JS rolls into March and would
  // quietly hand back a window three days short of the one that was asked for.
  assert.equal(
    decisionMapCutoff("3m", new Date("2026-05-31T12:00:00.000Z")),
    "2026-02-28T12:00:00.000Z"
  );
  assert.equal(
    decisionMapCutoff("3m", new Date("2024-05-31T12:00:00.000Z")),
    "2024-02-29T12:00:00.000Z"
  );
  assert.equal(
    decisionMapCutoff("12m", new Date("2026-03-31T12:00:00.000Z")),
    "2025-03-31T12:00:00.000Z"
  );
});
