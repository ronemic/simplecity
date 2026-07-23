import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DecisionOutcomeKind, SummaryCardRow } from "@/lib/types";
import {
  decisionResultFilterFromSlug,
  matchesDecisionResultFilter
} from "@/lib/utils/decisionResultFilter";

function resultCard({
  kind,
  meetingStatus = "Past",
  cardStatus = "Upcoming vote"
}: {
  kind?: DecisionOutcomeKind;
  meetingStatus?: string;
  cardStatus?: string;
}) {
  return {
    status: cardStatus,
    meetings: { status: meetingStatus },
    outcome: kind
      ? { kind, headline: kind, summary: `${kind} result` }
      : null
  } as SummaryCardRow;
}

test("accepts only supported public result-filter slugs", () => {
  for (const value of ["approved", "rejected", "continued", "amended", "awaiting"] as const) {
    assert.equal(decisionResultFilterFromSlug(value), value);
  }
  assert.equal(decisionResultFilterFromSlug("other"), undefined);
  assert.equal(decisionResultFilterFromSlug("APPROVED"), undefined);
  assert.equal(decisionResultFilterFromSlug(undefined), undefined);
});

test("matches verified outcomes by their canonical result kind", () => {
  assert.equal(matchesDecisionResultFilter(resultCard({ kind: "approved" }), "approved"), true);
  assert.equal(matchesDecisionResultFilter(resultCard({ kind: "approved" }), "rejected"), false);
  assert.equal(matchesDecisionResultFilter(resultCard({ kind: "amended" }), "amended"), true);
});

test("awaiting result means a past decision card with no verified outcome", () => {
  assert.equal(matchesDecisionResultFilter(resultCard({}), "awaiting"), true);
  assert.equal(
    matchesDecisionResultFilter(resultCard({ meetingStatus: "Upcoming" }), "awaiting"),
    false
  );
  assert.equal(
    matchesDecisionResultFilter(resultCard({ cardStatus: "Information only" }), "awaiting"),
    false
  );
  assert.equal(matchesDecisionResultFilter(resultCard({ kind: "continued" }), "awaiting"), false);
});

test("decision result controls preserve topic, search, and jurisdiction filters", () => {
  const resultSelect = readFileSync(
    new URL("../components/DecisionResultSelect.tsx", import.meta.url),
    "utf8"
  );
  const topicFilters = readFileSync(
    new URL("../components/DecisionFilters.tsx", import.meta.url),
    "utf8"
  );

  assert.match(resultSelect, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assert.match(resultSelect, /params\.set\("result"/);
  assert.match(resultSelect, /params\.delete\("page"\)/);
  assert.match(topicFilters, /function categoryHref/);
  assert.match(topicFilters, /params\.set\("category"/);
});
