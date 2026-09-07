import { createHash } from "node:crypto";
import type { AgendaItem, LlmReadyMeeting } from "@/lib/types";
import { extractMeetingWideParticipationContext, formatAgendaItemContexts } from "@/lib/scraper/agendaItemContext";
import { buildSimpleCityUserPrompt, SIMPLECITY_SYSTEM_PROMPT } from "@/lib/llm/prompts";
import { agendaItemsRequiringCards } from "@/lib/llm/agendaItemCoverage";

export type ExistingItemInput = {
  source_item_id?: string | null;
  model_input_text?: string | null;
  raw_llm_json?: unknown;
};

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
    if (unchanged) retainedItemIds.push(item.externalId);
    return !unchanged;
  });
  for (const item of selected) inputHashes.set(item.externalId, agendaItemInputHash(meeting, item));
  return { meeting: { ...meeting, items: selected }, retainedItemIds, inputHashes };
}
