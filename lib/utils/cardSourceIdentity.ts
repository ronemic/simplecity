import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";
import { findGuardedAgendaItemMatch } from "@/lib/outcomes/extractDecisionOutcome";
import { uniqueSourceItemIds } from "@/lib/utils/sourceItemIdentity";

export function attachSourceItemIds(
  meeting: Pick<LlmReadyMeeting, "items">,
  summary: SimpleCitySummary
): SimpleCitySummary {
  const items = meeting.items || [];
  const knownIds = uniqueSourceItemIds(items);

  return {
    ...summary,
    cards: summary.cards.map((card) => {
      if (card.sourceItemId && knownIds.has(card.sourceItemId)) return card;

      const item =
        findGuardedAgendaItemMatch(card.agendaItem, items, {
          sourceUrl: card.source
        })?.item ||
        findGuardedAgendaItemMatch(
          `${card.agendaItem} ${card.whatIsHappening.join(" ")}`,
          items,
          { sourceUrl: card.source }
        )?.item;
      return {
        ...card,
        sourceItemId: item && knownIds.has(item.externalId) ? item.externalId : null
      };
    })
  };
}
