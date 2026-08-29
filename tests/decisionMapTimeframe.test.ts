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
