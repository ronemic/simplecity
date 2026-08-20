import type { CardStatus } from "@/lib/cardStatus";

/**
 * A platform's structured action and result fields are authoritative about what
 * happened to an item. Cards must not describe a pending action for an item the
 * record already shows as withdrawn or decided.
 *
 * Every pattern is matched against the short structured fields only, never
 * against attachment prose: an item may lawfully approve a withdrawal of funds,
 * and a staff report may discuss a withdrawn application from another matter.
 */
const WITHDRAWN_ITEM_PATTERN =
  /^\s*(?:item\s+)?withdrawn\b|^\s*withdrawn from (?:the )?(?:agenda|calendar|consideration)\b/i;
const CONTINUED_RESULT_PATTERN = /^\s*(?:continued|postponed|tabled|deferred|referred)\b/i;
const APPROVED_RESULT_PATTERN =
  /^\s*(?:motion\s+)?(?:pass(?:ed)?|adopted|approved|carried|accepted|authorized)\b/i;
const FAILED_RESULT_PATTERN =
  /^\s*(?:motion\s+)?(?:fail(?:ed)?|denied|rejected|defeated)\b/i;
const NO_ACTION_RESULT_PATTERN = /^\s*no action(?: taken)?\b/i;

export type OfficialItemAction = {
  action?: string | null;
  result?: string | null;
};

export type OfficialItemSignal = "withdrawn" | "continued" | "approved" | "failed" | "no_action";

export function officialItemStatusSignal(
  official: OfficialItemAction
): OfficialItemSignal | null {
  const action = String(official.action || "").trim();
  const result = String(official.result || "").trim();

  if (WITHDRAWN_ITEM_PATTERN.test(action) || WITHDRAWN_ITEM_PATTERN.test(result)) {
    return "withdrawn";
  }
  if (CONTINUED_RESULT_PATTERN.test(result)) return "continued";
  if (FAILED_RESULT_PATTERN.test(result)) return "failed";
  if (NO_ACTION_RESULT_PATTERN.test(result)) return "no_action";
  if (APPROVED_RESULT_PATTERN.test(result) || /\bmotion passed\b/i.test(action)) {
    return "approved";
  }
  return null;
}

/** Statuses that tell a reader the body has not acted yet. */
export const PENDING_CARD_STATUSES = new Set<string>(["Upcoming vote", "Under discussion"]);

/** A withdrawn item was never acted on, so none of these may stand. */
export const ACTED_ON_CARD_STATUSES = new Set<string>([
  "Upcoming vote",
  "Under discussion",
  "Routine approval",
  "Passed"
]);

/**
 * The status a card should carry given the official record. Returns null when the
 * record shows nothing decided, leaving the normal pending statuses in place.
 *
 * "failed" and "no action" both map to Information only: the fixed status list
 * has no defeated state, and Information only is the only member that does not
 * imply the item is still pending or that it succeeded.
 */
export function cardStatusForOfficialItem(official: OfficialItemAction): CardStatus | null {
  switch (officialItemStatusSignal(official)) {
    case "withdrawn":
      return "Cancelled";
    case "continued":
      return "Tabled";
    case "approved":
      return "Passed";
    case "failed":
    case "no_action":
      return "Information only";
    default:
      return null;
  }
}
