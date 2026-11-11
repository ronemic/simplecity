import type { SummaryCardRow } from "@/lib/types";

export function decisionSortTime(card: SummaryCardRow) {
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

/** Effective meeting status: cards carry withEffectiveMeetingStatus meetings. */
export function isUpcomingDecision(card: SummaryCardRow) {
  return card.meetings?.status === "Upcoming";
}

/**
 * "Upcoming first": decisions at upcoming meetings soonest-first, then every
 * other decision newest-first. Featured cards get no special placement here,
 * since this order is meant to be read as a calendar.
 */
export function compareCardsUpcomingFirst(left: SummaryCardRow, right: SummaryCardRow) {
  const leftUpcoming = isUpcomingDecision(left);
  const rightUpcoming = isUpcomingDecision(right);
  if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;

  if (leftUpcoming) {
    // Undated upcoming items go after dated ones.
    const leftTime = decisionSortTime(left) || Number.POSITIVE_INFINITY;
    const rightTime = decisionSortTime(right) || Number.POSITIVE_INFINITY;
    if (leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;
  } else {
    const dateDelta = decisionSortTime(right) - decisionSortTime(left);
    if (dateDelta !== 0) return dateDelta;
  }

  const createdDelta = String(right.created_at || "").localeCompare(String(left.created_at || ""));
  if (createdDelta !== 0) return createdDelta;
  return right.id.localeCompare(left.id);
}
