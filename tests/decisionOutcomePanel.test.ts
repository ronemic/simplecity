import assert from "node:assert/strict";
import test from "node:test";
import { isLongDecisionOutcomeSummary } from "../components/DecisionOutcomePanel";

test("only long decision-result summaries receive the compact treatment", () => {
  assert.equal(isLongDecisionOutcomeSummary("The board approved the item."), false);
  assert.equal(isLongDecisionOutcomeSummary("A".repeat(241)), true);
});
