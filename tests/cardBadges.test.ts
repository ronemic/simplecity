import assert from "node:assert/strict";
import test from "node:test";
import {
  commentSummary,
  isOfficialSourceFallbackCard,
  officialSourceFallbackInfo,
  statusSummary
} from "../components/SummaryCard";
import type { SummaryCardRow } from "../lib/types";

test("official-source fallback cards are identified without affecting normal summaries", () => {
  assert.equal(
    isOfficialSourceFallbackCard({
      why_it_matters:
        "SimpleCity could not verify a generated summary for this item. The official agenda text is shown instead."
    }),
    true
  );
  assert.equal(
    isOfficialSourceFallbackCard({ why_it_matters: "This proposal would add 40 homes." }),
    false
  );
});

test("official-source fallback cards explain why the summary was unavailable", () => {
  assert.deepEqual(
    officialSourceFallbackInfo(
      {
        why_it_matters:
          "SimpleCity could not verify a generated summary for this item. The official agenda text is shown instead."
      },
      "en"
    ),
    {
      reason: "validation_failed",
      label: "Summary couldn’t be verified"
    }
  );
  assert.equal(
    officialSourceFallbackInfo(
      {
        why_it_matters:
          "SimpleCity could not generate a summary for this item. The official agenda text is shown instead."
      },
      "es"
    )?.label,
    "No se generó el resumen"
  );
  assert.equal(
    officialSourceFallbackInfo(
      { why_it_matters: "This proposal would add 40 homes." },
      "en"
    ),
    null
  );
});

test("information-only status and comment availability remain separate badges", () => {
  const card = {
    status: "Information only",
    meetings: { status: "Upcoming", date_text: "Jul 15, 2026", meeting_datetime: null }
  } as SummaryCardRow;

  assert.equal(statusSummary(card, "en").label, "Info only");
  assert.equal(commentSummary(null, true, "en")?.label, "Open for comment");
});

test("a comment option on a past meeting reads as closed, not open", () => {
  // Ochre is reserved for windows a reader can still act inside, so the same
  // comment path must not advertise itself once the meeting has happened.
  const open = commentSummary(null, true, "en", true);
  assert.equal(open?.label, "Open for comment");
  assert.match(open?.className || "", /bg-\[#f1fbf4\]/);

  const closed = commentSummary(null, true, "en", false);
  assert.equal(closed?.label, "Comment period has passed");
  assert.match(closed?.className || "", /bg-black/);
});

test("no comment path at all yields no comment badge", () => {
  assert.equal(commentSummary(null, false, "en"), null);
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
