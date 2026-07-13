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
