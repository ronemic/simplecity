import assert from "node:assert/strict";
import test from "node:test";
import type { SummaryCardRow } from "../lib/types";
import { cardSummaryPoints } from "../lib/utils/cardShare";

function cardWithSummary(whatIsHappening: string[] | string) {
  return { what_is_happening: whatIsHappening } as unknown as SummaryCardRow;
}

test("renders structured points without splitting legal abbreviations", () => {
  const card = cardWithSummary([
    "The City Council will review Satish Ramachandran v. City of Los Altos, case No. 18-cv-01223-VKD.",
    "This discussion is part of the closed-session agenda."
  ]);

  assert.deepEqual(cardSummaryPoints(card), [
    "The City Council will review Satish Ramachandran v. City of Los Altos, case No. 18-cv-01223-VKD.",
    "This discussion is part of the closed-session agenda."
  ]);
});

test("keeps punctuation-heavy dates, times, quotes, and abbreviations inside their points", () => {
  const card = cardWithSummary([
    "On Jan. 15, the U.S. Dept. will meet at 6:30 p.m. in City Hall.",
    "Staff called the proposal “complete.” Council review is still required."
  ]);

  assert.deepEqual(cardSummaryPoints(card), [
    "On Jan. 15, the U.S. Dept. will meet at 6:30 p.m. in City Hall.",
    "Staff called the proposal “complete.” Council review is still required."
  ]);
});

test("treats a legacy string as one intact point instead of guessing sentence boundaries", () => {
  const card = cardWithSummary(
    "The hearing concerns Smith v. City of Los Altos. Residents may attend."
  );

  assert.deepEqual(cardSummaryPoints(card), [
    "The hearing concerns Smith v. City of Los Altos. Residents may attend."
  ]);
});

test("reads rollout-compatible newline storage as structured points", () => {
  const card = cardWithSummary("First point.\nSecond point.");
  assert.deepEqual(cardSummaryPoints(card), ["First point.", "Second point."]);
});
