import { createHash } from "node:crypto";
import type { AgendaItem, LlmReadyMeeting } from "@/lib/types";
import { extractMeetingWideParticipationContext, formatAgendaItemContexts } from "@/lib/scraper/agendaItemContext";
import { buildSimpleCityUserPrompt, SIMPLECITY_SYSTEM_PROMPT } from "@/lib/llm/prompts";
import { agendaItemsRequiringCards } from "@/lib/llm/agendaItemCoverage";
import { officialSourceFallbackReason } from "@/lib/utils/summaryFallback";

export type ExistingItemInput = {
  source_item_id?: string | null;
  model_input_text?: string | null;
  why_it_matters?: string | null;
  raw_llm_json?: unknown;
};

/**
 * An official-source fallback card shows only the agenda title. It used to be
 * checkpointed like a real summary, so an item that lost its request to the
 * token budget stayed empty until the city edited the agenda. A fallback card
 * is now selected again on later runs until it has had this many real attempts.
 */
export const MAX_FALLBACK_SUMMARY_ATTEMPTS = 3;
const FALLBACK_ATTEMPTS_KEY = "_simplecityFallbackSummaryAttempts";

/**
 * Real summary attempts already spent on a fallback card, or null when the
 * card is not a fallback. Cards written before the counter existed count as
 * one attempt: most were tried once, and the rest were never dispatched.
 */
export function fallbackSummaryAttempts(card: ExistingItemInput): number | null {
  if (!officialSourceFallbackReason(card.why_it_matters)) return null;
  const raw = card.raw_llm_json;
  const stored = raw && typeof raw === "object" && FALLBACK_ATTEMPTS_KEY in raw
    ? (raw as Record<string, unknown>)[FALLBACK_ATTEMPTS_KEY]
    : undefined;
  return typeof stored === "number" && Number.isInteger(stored) && stored >= 0 ? stored : 1;
}

export function withFallbackSummaryAttempts(raw: unknown, attempts?: number) {
  if (attempts === undefined) return raw;
  return {
    ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { response: raw }),
    [FALLBACK_ATTEMPTS_KEY]: attempts
  };
}

// Include substantive shared input, not download diagnostics or batch numbering.
// Outcomes have their own reconciliation; merely moving from Upcoming to Past
// must not invalidate every agenda explanation.
export function sharedAgendaSummaryInput(meeting: LlmReadyMeeting) {
  return buildSimpleCityUserPrompt({
    ...meeting,
    status: "Upcoming",
    extractionNotes: [],
    llmInputText: extractMeetingWideParticipationContext(meeting.llmInputText).slice(0, 3500)
  });
}

export function agendaItemInputHash(meeting: LlmReadyMeeting, item: AgendaItem) {
  return createHash("sha256").update(JSON.stringify([
    "agenda-item-input-v1", SIMPLECITY_SYSTEM_PROMPT,
    sharedAgendaSummaryInput(meeting), formatAgendaItemContexts([item])
  ])).digest("hex");
}

export function withAgendaItemInputHash(raw: unknown, hash?: string) {
  if (!hash) return raw;
  return {
    ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { response: raw }),
    _simplecitySourceInputHash: hash
  };
}

export function selectAgendaItemsForGeneration(
  meeting: LlmReadyMeeting,
  cards: readonly ExistingItemInput[],
  previousSummarizedMeeting?: LlmReadyMeeting | null
) {
  const canReuseLegacy = Boolean(previousSummarizedMeeting &&
    sharedAgendaSummaryInput(previousSummarizedMeeting) === sharedAgendaSummaryInput(meeting));
  const required = agendaItemsRequiringCards(meeting);
  const inputHashes = new Map<string, string>();
  const retainedItemIds: string[] = [];
  /** Attempts already spent on each fallback card selected for another try. */
  const fallbackAttempts = new Map<string, number>();
  const selected = required.filter((item) => {
    const hash = agendaItemInputHash(meeting, item);
    // Ambiguous identities are never evidence that an item already has coverage.
    const matches = cards.filter((card) => card.source_item_id === item.externalId);
    if (!item.externalId || matches.length !== 1 ||
        meeting.items?.filter((candidate) => candidate.externalId === item.externalId).length !== 1) return true;
    const card = matches[0];
    const raw = card.raw_llm_json;
    const savedHash = raw && typeof raw === "object" && "_simplecitySourceInputHash" in raw
      ? raw._simplecitySourceInputHash : undefined;
    const unchanged = savedHash
      ? savedHash === hash
      : canReuseLegacy && Boolean(card.model_input_text) &&
        card.model_input_text === formatAgendaItemContexts([item]);
    if (unchanged) {
      // Same source, but the card is still a placeholder: try again. A changed
      // source starts a fresh count, so only unchanged items carry theirs over.
      const attempts = fallbackSummaryAttempts(card);
      if (attempts !== null && attempts < MAX_FALLBACK_SUMMARY_ATTEMPTS) {
        fallbackAttempts.set(item.externalId, attempts);
        return true;
      }
      retainedItemIds.push(item.externalId);
    }
    return !unchanged;
  });
  for (const item of selected) inputHashes.set(item.externalId, agendaItemInputHash(meeting, item));
  return { meeting: { ...meeting, items: selected }, retainedItemIds, inputHashes, fallbackAttempts };
}
