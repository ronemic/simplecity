import assert from "node:assert/strict";
import test from "node:test";
import { commentSummary, statusSummary } from "../components/SummaryCard";
import type { SummaryCardRow } from "../lib/types";

test("information-only status and comment availability remain separate badges", () => {
  const card = {
    status: "Information only",
    meetings: { status: "Upcoming", date_text: "Jul 15, 2026", meeting_datetime: null }
  } as SummaryCardRow;

  assert.equal(statusSummary(card, "en").label, "Info only");
  assert.equal(commentSummary(null, true, "en")?.label, "Comment option listed");
});

test("routine approvals have a distinct localized status badge", () => {
  const card = {
    status: "Routine approval",
    meetings: { status: "Upcoming", date_text: "Jul 15, 2026", meeting_datetime: null }
  } as SummaryCardRow;

  assert.equal(statusSummary(card, "en").label, "Routine approval");
  assert.equal(statusSummary(card, "es").label, "Aprobación rutinaria");
  assert.match(statusSummary(card, "en").className, /bg-\[#f4f5f8\]/);
});

test("past decision cards without a result clearly show that the official result is pending", () => {
  const card = {
    status: "Upcoming vote",
    outcome: null,
    meetings: { status: "Past", date_text: "Jul 15, 2026", meeting_datetime: null }
  } as SummaryCardRow;

  assert.equal(statusSummary(card, "en").label, "Awaiting official result");
  assert.equal(statusSummary(card, "es").label, "Esperando resultado oficial");
  assert.match(statusSummary(card, "en").className, /bg-\[#eef2ff\]/);
});

test("an attached result takes precedence over the awaiting-result state", () => {
  const card = {
    status: "Upcoming vote",
    outcome: null,
    meetings: { status: "Past", date_text: "Jul 15, 2026", meeting_datetime: null }
  } as SummaryCardRow;
  const outcome = {
    kind: "approved",
    headline: "Approved",
    summary: "The council approved the item."
  } as const;

  assert.equal(statusSummary(card, "en", outcome).label, "Vote scheduled Jul 15");
});

test("upcoming and non-decision cards are not marked as awaiting a result", () => {
  const upcomingCard = {
    status: "Upcoming vote",
    outcome: null,
    meetings: { status: "Upcoming", date_text: "Jul 29, 2026", meeting_datetime: null }
  } as SummaryCardRow;
  const informationalCard = {
    status: "Information only",
    outcome: null,
    meetings: { status: "Past", date_text: "Jul 15, 2026", meeting_datetime: null }
  } as SummaryCardRow;

  assert.equal(statusSummary(upcomingCard, "en").label, "Vote scheduled Jul 29");
  assert.equal(statusSummary(informationalCard, "en").label, "Info only");
});
