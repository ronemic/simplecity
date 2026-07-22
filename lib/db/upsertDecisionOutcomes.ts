import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmReadyMeeting, SummaryCardRow } from "@/lib/types";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import {
  type DecisionOutcomeMatchMethod,
  extractDecisionOutcome,
  extractMeetingOutcomeItems
} from "@/lib/outcomes/extractDecisionOutcome";
import {
  generateDecisionOutcomeExplanations,
  hasDecisionOutcomeExplanationProvider
} from "@/lib/outcomes/generateDecisionOutcomeExplanations";
import { translateAndUpsertDecisionOutcomes } from "@/lib/db/upsertDecisionOutcomeTranslations";
import { hasTranslationProvider } from "@/lib/llm/translate";
import { findGuardedAgendaItemMatch } from "@/lib/outcomes/extractDecisionOutcome";
import { uniqueSourceItemIds } from "@/lib/utils/sourceItemIdentity";

const OUTCOME_CARD_COLUMNS = "id,source_item_id,agenda_item,source_url,created_at";
const LEGACY_OUTCOME_CARD_COLUMNS = "id,agenda_item,source_url,created_at";

export type DecisionOutcomeReconciliation = {
  cardsChecked: number;
  outcomesFound: number;
  outcomesUpserted: number;
  outcomesRejectedAmbiguous: number;
  resultItemsFound: number;
  resultItemsMatched: number;
  resultItemsUnmatched: number;
  resultCardsFound: number;
  resultCardsMatched: number;
  resultCardsUnmatched: number;
  informationalItemsFound: number;
  duplicateCardsDetected: number;
  duplicateCardsResolved: number;
  complete: boolean;
};

export function fallbackDecisionOutcomeSummary(
  cardTitle: string,
  headline: string,
  vote?: string | null
) {
  const title = cardTitle.trim().replace(/[.!?]+$/, "");
  const status = headline.trim().replace(/[.!?]+$/, "").toLowerCase();
  const voteText = vote ? ` (${vote})` : "";
  if (/^no action taken$/.test(status)) {
    return `No action was taken on “${title}”.`;
  }
  if (/^(?:passed|committee motion passed)/.test(status)) {
    return `The item “${title}” ${status}${voteText}.`;
  }
  return `The item “${title}” was ${status}${voteText}.`;
}

export function decisionOutcomeCoverageComplete(
  resultCardsFound: number,
  resultCardsMatched: number
) {
  return resultCardsFound === resultCardsMatched;
}

export function keepUniqueOutcomeAssignments<T extends { matchedItemKey: string }>(
  proposals: T[]
) {
  const assignmentCounts = new Map<string, number>();
  for (const proposal of proposals) {
    assignmentCounts.set(
      proposal.matchedItemKey,
      (assignmentCounts.get(proposal.matchedItemKey) || 0) + 1
    );
  }
  return proposals.filter(
    (proposal) => assignmentCounts.get(proposal.matchedItemKey) === 1
  );
}

export function resolveCanonicalOutcomeAssignments<
  T extends {
    matchedItemKey: string;
    matchMethod?: DecisionOutcomeMatchMethod;
    matchScore?: number;
    cardCreatedAt?: string | null;
    cardSourceUrl?: string | null;
  }
>(proposals: T[], minutesSourceUrls: Set<string>) {
  const grouped = new Map<string, T[]>();
  for (const proposal of proposals) {
    grouped.set(proposal.matchedItemKey, [
      ...(grouped.get(proposal.matchedItemKey) || []),
      proposal
    ]);
  }

  const selected: T[] = [];
  let rejectedAmbiguous = 0;
  let duplicateCardsDetected = 0;
  let duplicateCardsResolved = 0;

  for (const group of grouped.values()) {
    if (group.length === 1) {
      selected.push(group[0]);
      continue;
    }

    duplicateCardsDetected += group.length - 1;
    const nonMinutesCards = group.filter(
      (proposal) => !minutesSourceUrls.has(String(proposal.cardSourceUrl || ""))
    );
    if (nonMinutesCards.length === 1) {
      selected.push(nonMinutesCards[0]);
      duplicateCardsResolved += group.length - 1;
      continue;
    }

    const methodPriority: Record<DecisionOutcomeMatchMethod, number> = {
      source_item_id: 4,
      agenda_number: 3,
      source_url: 2,
      title: 1
    };
    const rankedByIdentity = group
      .map((proposal) => ({
        proposal,
        rank: proposal.matchMethod ? methodPriority[proposal.matchMethod] : 0,
        score: proposal.matchScore ?? 0
      }))
      .sort((left, right) => right.rank - left.rank || right.score - left.score);
    if (
      rankedByIdentity[0].rank >= methodPriority.source_url &&
      (rankedByIdentity[1]?.rank ?? -1) < rankedByIdentity[0].rank
    ) {
      selected.push(rankedByIdentity[0].proposal);
      duplicateCardsResolved += group.length - 1;
      continue;
    }

    const dated = group
      .map((proposal) => ({
        proposal,
        timestamp: Date.parse(String(proposal.cardCreatedAt || ""))
      }))
      .filter((candidate) => Number.isFinite(candidate.timestamp))
      .sort((left, right) => left.timestamp - right.timestamp);
    const oneDay = 24 * 60 * 60 * 1000;
    if (
      dated.length === group.length &&
      dated.length > 1 &&
      dated[1].timestamp - dated[0].timestamp >= oneDay
    ) {
      selected.push(dated[0].proposal);
      duplicateCardsResolved += group.length - 1;
      continue;
    }

    rejectedAmbiguous += group.length;
  }

  return {
    selected,
    rejectedAmbiguous,
    duplicateCardsDetected,
    duplicateCardsResolved
  };
}

function cardHasOfficialResult(
  card: Pick<SummaryCardRow, "source_item_id" | "agenda_item" | "source_url">,
  meeting: LlmReadyMeeting,
  resultItems: ReturnType<typeof extractMeetingOutcomeItems>["items"]
) {
  if (/\bpublic comment\b|\bcomment opportunity\b/i.test(String(card.agenda_item || ""))) {
    return false;
  }
  const sourceItemId = String(card.source_item_id || "").trim();
  if (sourceItemId && uniqueSourceItemIds(resultItems).has(sourceItemId)) return true;

  const sourceItem = sourceItemId && uniqueSourceItemIds(meeting.items || []).has(sourceItemId)
    ? (meeting.items || []).find((item) => item.externalId === sourceItemId)
    : null;
  return Boolean(findGuardedAgendaItemMatch(
    String(card.agenda_item || ""),
    resultItems,
    {
      sourceUrl: card.source_url,
      agendaNumber: sourceItem?.agendaNumber || null
    }
  ));
}

function isMissingOutcomeTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "PGRST205" ||
        /decision_outcomes|could not find the table/i.test(error.message || ""))
  );
}

function isMissingSourceItemIdColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && /source_item_id|PGRST204|column/i.test(error.message || ""));
}

export async function reconcileDecisionOutcomesForMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  meeting: LlmReadyMeeting,
  jurisdiction?: JurisdictionConfig | null,
  options: {
    explainWithLlm?: boolean;
    translateWithLlm?: boolean;
    persist?: boolean;
    log?: (message: string) => void;
  } = {}
): Promise<DecisionOutcomeReconciliation> {
  const initialCards = await supabase
    .from("summary_cards")
    .select(OUTCOME_CARD_COLUMNS)
    .eq("meeting_id", meetingId);
  let cards: unknown = initialCards.data;
  let cardError = initialCards.error;

  if (isMissingSourceItemIdColumn(cardError)) {
    const legacy = await supabase
      .from("summary_cards")
      .select(LEGACY_OUTCOME_CARD_COLUMNS)
      .eq("meeting_id", meetingId);
    cards = legacy.data;
    cardError = legacy.error;
  }

  if (cardError) {
    throw new Error(`Failed to load cards for decision outcomes: ${cardError.message}`);
  }

  const cardRows = (Array.isArray(cards) ? cards : []) as Array<
    Pick<SummaryCardRow, "id" | "source_item_id" | "agenda_item" | "source_url" | "created_at">
  >;
  const inventory = extractMeetingOutcomeItems(meeting);
  const proposals = cardRows.flatMap((card) => {
    const outcome = extractDecisionOutcome(card, meeting);
    if (!outcome) return [];

    return [
      {
        matchedItemKey: outcome.matchedItemKey,
        matchMethod: outcome.matchMethod,
        matchScore: outcome.matchScore,
        cardCreatedAt: card.created_at,
        cardSourceUrl: card.source_url,
        cardId: card.id,
        cardTitle: String(card.agenda_item || ""),
        outcome,
        row: {
          summary_card_id: card.id,
          meeting_id: meetingId,
          jurisdiction_name: jurisdiction?.name || meeting.jurisdictionName || null,
          jurisdiction_slug: jurisdiction?.slug || meeting.jurisdictionSlug || null,
          platform: jurisdiction?.platform || meeting.platform || null,
          kind: outcome.kind,
          headline: outcome.headline,
          summary: outcome.summary,
          decided_at: outcome.decidedAt,
          vote: outcome.vote,
          next_step: outcome.nextStep,
          source_url: outcome.sourceUrl,
          source_hash: outcome.sourceHash,
          source_text: outcome.sourceText,
          matched_item_key: outcome.matchedItemKey,
          match_method: outcome.matchMethod,
          match_score: outcome.matchScore
        }
      }
    ];
  });
  const minutesSourceUrls = new Set(
    meeting.documents
      .filter((document) => ["Minutes", "Accessible Minutes"].includes(document.type))
      .map((document) => document.url)
  );
  const resolved = resolveCanonicalOutcomeAssignments(proposals, minutesSourceUrls);
  const resultCardIds = new Set(
    cardRows
      .filter((card) => cardHasOfficialResult(card, meeting, inventory.items))
      .map((card) => card.id)
  );
  const selectedCardByItem = new Map(
    resolved.selected.map((proposal) => [proposal.matchedItemKey, proposal.cardId])
  );
  for (const proposal of proposals) {
    const selectedCardId = selectedCardByItem.get(proposal.matchedItemKey);
    if (selectedCardId && selectedCardId !== proposal.cardId) {
      resultCardIds.delete(proposal.cardId);
    }
  }
  let explanations = new Map<string, { summary: string; nextStep: string | null }>();
  if (
    options.explainWithLlm &&
    resolved.selected.length > 0 &&
    hasDecisionOutcomeExplanationProvider()
  ) {
    try {
      explanations = await generateDecisionOutcomeExplanations(
        resolved.selected.map((proposal) => ({
          id: proposal.cardId,
          title: proposal.cardTitle,
          canonicalStatus: proposal.outcome.canonicalStatus,
          canonicalHeadline: proposal.outcome.headline,
          fallbackSummary: proposal.outcome.summary,
          fallbackNextStep: proposal.outcome.nextStep,
          sourceContext: proposal.outcome.sourceContext
        })),
        { log: options.log }
      );
    } catch (error) {
      options.log?.(
        `Decision explanation generation failed; using grounded rule-based copy: ${
          error instanceof Error ? error.message : "Unknown LLM error"
        }`
      );
    }
  }
  const rows = resolved.selected.map((proposal) => {
    const explanation = explanations.get(proposal.cardId);
    return {
      ...proposal.row,
      summary:
        explanation?.summary ||
        fallbackDecisionOutcomeSummary(
          proposal.cardTitle,
          proposal.outcome.headline,
          proposal.outcome.vote
        ),
      next_step: explanation?.nextStep ?? proposal.row.next_step
    };
  });
  const matchedItemKeys = new Set(
    resolved.selected.map((proposal) => proposal.matchedItemKey)
  );
  const matchedResultCardIds = new Set(
    resolved.selected
      .filter((proposal) => resultCardIds.has(proposal.cardId))
      .map((proposal) => proposal.cardId)
  );
  // A few platforms expose results only in a guarded minutes-text window,
  // outside the structured result inventory.
  const knownResultItemCount = Math.max(inventory.items.length, matchedItemKeys.size);
  const report = {
    cardsChecked: cardRows.length,
    outcomesFound: proposals.length,
    outcomesRejectedAmbiguous: resolved.rejectedAmbiguous,
    resultItemsFound: knownResultItemCount,
    resultItemsMatched: matchedItemKeys.size,
    resultItemsUnmatched: knownResultItemCount - matchedItemKeys.size,
    resultCardsFound: resultCardIds.size,
    resultCardsMatched: matchedResultCardIds.size,
    resultCardsUnmatched: resultCardIds.size - matchedResultCardIds.size,
    informationalItemsFound: inventory.informationalItemsFound,
    duplicateCardsDetected: resolved.duplicateCardsDetected,
    duplicateCardsResolved: resolved.duplicateCardsResolved,
    complete: decisionOutcomeCoverageComplete(
      resultCardIds.size,
      matchedResultCardIds.size
    )
  };

  if (rows.length === 0) {
    return {
      ...report,
      outcomesUpserted: 0,
    };
  }

  if (options.persist === false) {
    return {
      ...report,
      outcomesUpserted: 0
    };
  }

  const { data, error } = await supabase
    .from("decision_outcomes")
    .upsert(rows, { onConflict: "summary_card_id" })
    .select("id,summary_card_id");

  if (isMissingOutcomeTable(error)) {
    return {
      ...report,
      outcomesUpserted: 0,
    };
  }
  if (error) {
    throw new Error(`Failed to upsert decision outcomes: ${error.message}`);
  }

  if (options.translateWithLlm && hasTranslationProvider()) {
    const rowByCardId = new Map(rows.map((row) => [row.summary_card_id, row]));
    const persistedOutcomes = (data || []).flatMap((persisted) => {
      const row = rowByCardId.get(persisted.summary_card_id);
      return row ? [{ ...row, id: persisted.id }] : [];
    });
    try {
      const translated = await translateAndUpsertDecisionOutcomes(
        supabase,
        persistedOutcomes,
        "es",
        { log: options.log }
      );
      if (translated > 0) {
        options.log?.(`Wrote ${translated} Spanish decision outcome translation(s).`);
      }
    } catch (translationError) {
      options.log?.(
        `Decision outcome translation failed; English outcome remains available: ${
          translationError instanceof Error ? translationError.message : "Unknown translation error"
        }`
      );
    }
  }

  return {
    ...report,
    outcomesUpserted: data?.length || 0,
  };
}
