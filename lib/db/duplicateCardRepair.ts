import type { AgendaItem } from "@/lib/types";
import { findGuardedAgendaItemMatch } from "@/lib/outcomes/extractDecisionOutcome";
import { summaryPointsText } from "@/lib/utils/summaryPoints";
import { uniqueSourceItemIds } from "@/lib/utils/sourceItemIdentity";

export type DuplicateRepairCard = {
  id: string;
  source_item_id?: string | null;
  agenda_item: string | null;
  source_url: string | null;
  what_is_happening?: string | string[] | null;
  created_at: string | null;
};

export type DuplicateCardRepairGroup = {
  sourceItemId: string;
  survivorCardId: string;
  duplicateCardIds: string[];
  outcomeCardId: string | null;
  matchedCardIds: string[];
};

function cardMatch(card: DuplicateRepairCard, items: AgendaItem[]) {
  if (card.source_item_id) {
    const exact = items.find((item) => item.externalId === card.source_item_id);
    if (exact) return exact;
  }

  const title = String(card.agenda_item || "").trim();
  if (!title) return null;
  const direct = findGuardedAgendaItemMatch(title, items, {
    sourceUrl: card.source_url
  });
  if (direct) return direct.item;

  const points = summaryPointsText(card.what_is_happening);
  return findGuardedAgendaItemMatch(`${title} ${points}`, items, {
    sourceUrl: card.source_url
  })?.item || null;
}

function createdTime(card: DuplicateRepairCard) {
  const timestamp = Date.parse(String(card.created_at || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function planDuplicateCardRepair(
  cards: DuplicateRepairCard[],
  items: AgendaItem[],
  outcomeCardIds: Set<string>
) {
  const uniqueIds = uniqueSourceItemIds(items);
  const safeItems = items.filter((item) => uniqueIds.has(item.externalId));
  const grouped = new Map<string, DuplicateRepairCard[]>();
  const unmatchedCardIds: string[] = [];

  for (const card of cards) {
    const item = cardMatch(card, safeItems);
    if (!item) {
      unmatchedCardIds.push(card.id);
      continue;
    }
    grouped.set(item.externalId, [
      ...(grouped.get(item.externalId) || []),
      card
    ]);
  }

  const groups: DuplicateCardRepairGroup[] = [];
  const ambiguousSourceItemIds: string[] = [];
  for (const [sourceItemId, matchedCards] of grouped) {
    const outcomeCards = matchedCards.filter((card) => outcomeCardIds.has(card.id));
    if (outcomeCards.length > 1) {
      ambiguousSourceItemIds.push(sourceItemId);
      continue;
    }

    const survivor = [...matchedCards].sort(
      (left, right) => createdTime(right) - createdTime(left) || right.id.localeCompare(left.id)
    )[0];
    groups.push({
      sourceItemId,
      survivorCardId: survivor.id,
      duplicateCardIds: matchedCards
        .filter((card) => card.id !== survivor.id)
        .map((card) => card.id),
      outcomeCardId: outcomeCards[0]?.id || null,
      matchedCardIds: matchedCards.map((card) => card.id)
    });
  }

  return { groups, unmatchedCardIds, ambiguousSourceItemIds };
}
