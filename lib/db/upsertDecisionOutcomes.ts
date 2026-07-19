import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmReadyMeeting, SummaryCardRow } from "@/lib/types";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import {
  extractDecisionOutcome,
  extractMeetingOutcomeItems
} from "@/lib/outcomes/extractDecisionOutcome";
import {
  generateDecisionOutcomeExplanations,
  hasDecisionOutcomeExplanationProvider
} from "@/lib/outcomes/generateDecisionOutcomeExplanations";

const OUTCOME_CARD_COLUMNS = "id,agenda_item,source_url,created_at";

export type DecisionOutcomeReconciliation = {
  cardsChecked: number;
  outcomesFound: number;
  outcomesUpserted: number;
  outcomesRejectedAmbiguous: number;
  resultItemsFound: number;
  resultItemsMatched: number;
  resultItemsUnmatched: number;
  informationalItemsFound: number;
  duplicateCardsDetected: number;
  duplicateCardsResolved: number;
  complete: boolean;
};

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

function isMissingOutcomeTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "PGRST205" ||
        /decision_outcomes|could not find the table/i.test(error.message || ""))
  );
}

export async function reconcileDecisionOutcomesForMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  meeting: LlmReadyMeeting,
  jurisdiction?: JurisdictionConfig | null,
  options: {
    explainWithLlm?: boolean;
    log?: (message: string) => void;
  } = {}
): Promise<DecisionOutcomeReconciliation> {
  const { data: cards, error: cardError } = await supabase
    .from("summary_cards")
    .select(OUTCOME_CARD_COLUMNS)
    .eq("meeting_id", meetingId);

  if (cardError) {
    throw new Error(`Failed to load cards for decision outcomes: ${cardError.message}`);
  }

  const cardRows = (cards || []) as unknown as Array<
    Pick<SummaryCardRow, "id" | "agenda_item" | "source_url" | "created_at">
  >;
  const inventory = extractMeetingOutcomeItems(meeting);
  const proposals = cardRows.flatMap((card) => {
    const outcome = extractDecisionOutcome(card, meeting);
    if (!outcome) return [];

    return [
      {
        matchedItemKey: outcome.matchedItemKey,
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
    return explanation
      ? {
          ...proposal.row,
          summary: explanation.summary,
          next_step: explanation.nextStep
        }
      : proposal.row;
  });
  const matchedItemKeys = new Set(
    resolved.selected.map((proposal) => proposal.matchedItemKey)
  );
  const report = {
    cardsChecked: cardRows.length,
    outcomesFound: proposals.length,
    outcomesRejectedAmbiguous: resolved.rejectedAmbiguous,
    resultItemsFound: inventory.items.length,
    resultItemsMatched: matchedItemKeys.size,
    resultItemsUnmatched: Math.max(0, inventory.items.length - matchedItemKeys.size),
    informationalItemsFound: inventory.informationalItemsFound,
    duplicateCardsDetected: resolved.duplicateCardsDetected,
    duplicateCardsResolved: resolved.duplicateCardsResolved,
    complete:
      inventory.items.length === matchedItemKeys.size &&
      resolved.rejectedAmbiguous === 0
  };

  if (rows.length === 0) {
    return {
      ...report,
      outcomesUpserted: 0,
    };
  }

  const { data, error } = await supabase
    .from("decision_outcomes")
    .upsert(rows, { onConflict: "summary_card_id" })
    .select("id");

  if (isMissingOutcomeTable(error)) {
    return {
      ...report,
      outcomesUpserted: 0,
    };
  }
  if (error) {
    throw new Error(`Failed to upsert decision outcomes: ${error.message}`);
  }

  return {
    ...report,
    outcomesUpserted: data?.length || 0,
  };
}
