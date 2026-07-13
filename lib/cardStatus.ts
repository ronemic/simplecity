export const CARD_STATUSES = [
  "Upcoming vote",
  "Routine approval",
  "Under discussion",
  "Passed",
  "Tabled",
  "Cancelled",
  "Information only"
] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];
