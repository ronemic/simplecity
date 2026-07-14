import assert from "node:assert/strict";
import test from "node:test";
import type { SummaryCardRow } from "../lib/types";
import { cardSummaryPoints } from "../lib/utils/cardShare";

function cardWithSummary(whatIsHappening: string) {
  return { what_is_happening: whatIsHappening } as SummaryCardRow;
}

test("keeps legal case names with v. in the same summary point", () => {
  const card = cardWithSummary(
    "The City Council will meet with legal counsel to review the lawsuit Satish Ramachandran v. City of Los Altos, case No. 18-cv-01223-VKD. This discussion is part of the closed-session agenda."
  );

  assert.deepEqual(cardSummaryPoints(card), [
    "The City Council will meet with legal counsel to review the lawsuit Satish Ramachandran v. City of Los Altos, case No. 18-cv-01223-VKD.",
    "This discussion is part of the closed-session agenda."
  ]);
});

test("keeps legal case names with vs. in the same summary point", () => {
  const card = cardWithSummary(
    "The hearing concerns Smith vs. City of Los Altos. Residents may attend."
  );

  assert.deepEqual(cardSummaryPoints(card), [
    "The hearing concerns Smith vs. City of Los Altos.",
    "Residents may attend."
  ]);
});
