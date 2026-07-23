import type { DecisionOutcome, SummaryCardRow } from "@/lib/types";

export const DECISION_RESULT_FILTERS = [
  "approved",
  "rejected",
  "continued",
  "amended",
  "awaiting"
] as const;

export type DecisionResultFilter = (typeof DECISION_RESULT_FILTERS)[number];

export function decisionResultFilterFromSlug(
  value: string | null | undefined
): DecisionResultFilter | undefined {
  return DECISION_RESULT_FILTERS.find((filter) => filter === value);
}

export function isAwaitingDecisionResult(
  card: SummaryCardRow,
  outcome: DecisionOutcome | null = card.outcome || null
) {
  return card.status === "Upcoming vote" && card.meetings?.status === "Past" && !outcome;
}

export function matchesDecisionResultFilter(
  card: SummaryCardRow,
  filter?: DecisionResultFilter
) {
  if (!filter) return true;
  if (filter === "awaiting") return isAwaitingDecisionResult(card);
  return card.outcome?.kind === filter;
}
