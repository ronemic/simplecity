import assert from "node:assert/strict";
import test from "node:test";
import type { SummaryCardRow } from "../lib/types";
import { cardPreviewText, cardSummaryPoints } from "../lib/utils/cardShare";

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

test("keeps the plain-language summary when a search only matches meeting metadata", () => {
  const card = {
    agenda_item: "Contract for fire district HQ environmental review",
    what_is_happening: ["The City Council will authorize an environmental review contract."],
    why_it_matters: "The review is required before construction can begin.",
    meetings: {
      title: "City Council - Feb. 10, 2026"
    }
  } as unknown as SummaryCardRow;

  assert.equal(
    cardPreviewText(card, "en", "Feb."),
    "The City Council will authorize an environmental review contract."
  );
});

test("uses a matching summary excerpt when the search matches substantive content", () => {
  const card = {
    agenda_item: "Downtown parking plaza redevelopment",
    what_is_happening: ["Staff will report on proposals for affordable housing and public parking."],
    why_it_matters: "The project could add new homes downtown."
  } as unknown as SummaryCardRow;

  assert.equal(
    cardPreviewText(card, "en", "affordable"),
    "Staff will report on proposals for affordable housing and public parking."
  );
});
