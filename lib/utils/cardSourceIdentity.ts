import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";
import { findGuardedAgendaItemMatch } from "@/lib/outcomes/extractDecisionOutcome";
import { uniqueSourceItemIds } from "@/lib/utils/sourceItemIdentity";
import { cleanText } from "@/lib/utils/slug";

type SourceIdentityCard = Pick<
  SimpleCitySummary["cards"][number],
  "sourceItemId" | "agendaItem" | "whatIsHappening" | "source"
>;

export function resolveCardSourceItemId(
  meeting: Pick<LlmReadyMeeting, "items">,
  card: SourceIdentityCard
) {
  const items = meeting.items || [];
  const knownIds = uniqueSourceItemIds(items);
  if (card.sourceItemId && knownIds.has(card.sourceItemId)) {
    return card.sourceItemId;
  }

  const normalizedCardTitle = cleanText(card.agendaItem).toLowerCase();
  const exactTitleMatches = items.filter(
    (item) => cleanText(item.title || "").toLowerCase() === normalizedCardTitle
  );
  if (
    exactTitleMatches.length === 1 &&
    knownIds.has(exactTitleMatches[0].externalId)
  ) {
    return exactTitleMatches[0].externalId;
  }

  const item =
    findGuardedAgendaItemMatch(card.agendaItem, items, {
      sourceUrl: card.source
    })?.item ||
    findGuardedAgendaItemMatch(
      `${card.agendaItem} ${card.whatIsHappening.join(" ")}`,
      items,
      { sourceUrl: card.source }
    )?.item;
  return item && knownIds.has(item.externalId) ? item.externalId : null;
}

export function attachSourceItemIds(
  meeting: Pick<LlmReadyMeeting, "items">,
  summary: SimpleCitySummary
): SimpleCitySummary {
  return {
    ...summary,
    cards: summary.cards.map((card) => ({
      ...card,
      sourceItemId: resolveCardSourceItemId(meeting, card)
    }))
  };
}
