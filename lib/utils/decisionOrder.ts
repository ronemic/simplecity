import type { SummaryCardRow } from "@/lib/types";

function decisionSortTime(card: SummaryCardRow) {
  const value =
    card.decision_sort_at ||
    card.meetings?.meeting_datetime ||
    card.updated_at ||
    card.created_at;
  if (!value) return 0;

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function compareCardsByDecisionOrder(left: SummaryCardRow, right: SummaryCardRow) {
  const featuredDelta = Number(Boolean(right.is_featured)) - Number(Boolean(left.is_featured));
  if (featuredDelta !== 0) return featuredDelta;

  const dateDelta = decisionSortTime(right) - decisionSortTime(left);
  if (dateDelta !== 0) return dateDelta;

  const createdDelta = String(right.created_at || "").localeCompare(String(left.created_at || ""));
  if (createdDelta !== 0) return createdDelta;
  return right.id.localeCompare(left.id);
}
