import assert from "node:assert/strict";
import test from "node:test";
import {
  advisoryOutcomeHeadline,
  isLongDecisionOutcomeSummary
} from "../components/DecisionOutcomePanel";

test("only long decision-result summaries receive the compact treatment", () => {
  assert.equal(isLongDecisionOutcomeSummary("The board approved the item."), false);
  assert.equal(isLongDecisionOutcomeSummary("A".repeat(241)), true);
});

test("Planning Commission outcomes are presented as recommendations", () => {
  assert.equal(advisoryOutcomeHeadline("Approved unanimously", "en"), "Recommended approval");
  assert.equal(advisoryOutcomeHeadline("Motion denied", "en"), "Recommended denial");
  assert.equal(advisoryOutcomeHeadline("Approved unanimously", "es"), "Recomendó la aprobación");
});
