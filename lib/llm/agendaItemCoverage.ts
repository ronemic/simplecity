import type {
  AgendaItem,
  LlmReadyMeeting,
  SimpleCityCard,
  SimpleCityCardTranslation,
  SimpleCitySummary
} from "@/lib/types";
import {
  extractMeetingWideParticipationContext,
  formatAgendaItemContexts,
  MEETING_WIDE_CONTEXT_HEADING
} from "@/lib/scraper/agendaItemContext";
import { uniqueSourceItemIds } from "@/lib/utils/sourceItemIdentity";

type SummaryResult = { summary: SimpleCitySummary; raw: unknown };

const ROUTINE_ITEM = /^(?:call to order(?: and roll call)?|roll call|pledge of allegiance|invocation|opening remarks?|approv(?:al of|e|ing) (?:the )?(?:agenda|order of business|minutes)|public comments?|open forum|oral communications?|staff reports?|committee reports?|commission reports?|future agenda items?|announcements?|adjournment)(?:\b|\s*[-:])/i;
const DECISION_ACTION = /\b(?:approve|adopt|authorize|award|appoint|select|deny|amend|continue|recommend|provide direction|public hearing|application|permit|subdivision|variance|appeal)\b/i;

function itemLabel(item: AgendaItem) {
  return String(item.title || item.rowText || `Agenda item ${item.agendaNumber || "Unnumbered"}`)
    .replace(/^\s*[A-Za-z]?\d+(?:\.\d+)?\s*[.):-]\s*/, "")
    .trim();
}

export function isRoutineAgendaItem(item: AgendaItem) {
  const label = itemLabel(item);
  const section = String(item.itemType || "").trim();
  return ROUTINE_ITEM.test(label) || (ROUTINE_ITEM.test(section) && label === section);
}

export function agendaItemsRequiringCards(meeting: Pick<LlmReadyMeeting, "items">) {
  const items = meeting.items || [];
  const stableIds = uniqueSourceItemIds(items);
  return items.filter(
    (item) => stableIds.has(item.externalId) && !isRoutineAgendaItem(item)
  );
}

export function uncoveredAgendaItems(
  meeting: Pick<LlmReadyMeeting, "items">,
  summary: Pick<SimpleCitySummary, "cards">
) {
  const coveredIds = new Set(
    summary.cards.flatMap((card) => card.sourceItemId ? [card.sourceItemId] : [])
  );
  return agendaItemsRequiringCards(meeting).filter((item) => !coveredIds.has(item.externalId));
}

export function agendaItemRetryMeeting(
  meeting: LlmReadyMeeting,
  items: AgendaItem | AgendaItem[]
): LlmReadyMeeting {
  const retryItems = Array.isArray(items) ? items : [items];
  const participationContext = extractMeetingWideParticipationContext(meeting.llmInputText);
  return {
    ...meeting,
    items: retryItems,
    llmInputText: [
      retryItems.length === 1
        ? "Generate a card for this one official agenda item if it is substantive. Do not summarize any other item."
        : "Generate one card for each substantive official agenda item in this recovery batch. Do not summarize any other item.",
      formatAgendaItemContexts(retryItems),
      participationContext
        ? `${MEETING_WIDE_CONTEXT_HEADING}\n${participationContext}`
        : ""
    ].filter(Boolean).join("\n\n"),
    extractionNotes: [
      ...meeting.extractionNotes,
      `Recovering ${retryItems.length} uncovered official agenda item(s): ${retryItems
        .map((item) => item.agendaNumber || item.externalId)
        .join(", ")}.`
    ]
  };
}

function fallbackStatus(meeting: LlmReadyMeeting, item: AgendaItem) {
  if (meeting.status === "Cancelled") return "Cancelled";
  const actionText = [item.title, item.action, item.recommendedAction, item.rowText]
    .filter(Boolean)
    .join(" ");
  return DECISION_ACTION.test(actionText) ? "Upcoming vote" : "Under discussion";
}

function fallbackCard(meeting: LlmReadyMeeting, item: AgendaItem): SimpleCityCard {
  const title = itemLabel(item);
  const source = item.sourceUrl || meeting.sourceUrl || meeting.meetingDetailsUrl || "";
  return {
    sourceItemId: item.externalId,
    agendaItem: title,
    whatIsHappening: [`The official agenda lists “${title}” for consideration.`],
    whyItMatters: "A detailed SimpleCity summary is still being prepared. The official agenda item is available now so it is not omitted.",
    whoItAffects: ["Not listed in the source document."],
    categoryTags: [],
    status: fallbackStatus(meeting, item),
    commentWindow: {
      opens: "Not listed in the source document.",
      closes: "Not listed in the source document."
    },
    howToAct: {
      attend: "See the official meeting source for participation details.",
      email: "Not listed in the source document.",
      submitComment: "Not listed in the source document."
    },
    source,
    confidence: "low"
  };
}

function fallbackTranslation(card: SimpleCityCard): SimpleCityCardTranslation {
  return {
    agendaItem: card.agendaItem,
    whatIsHappening: [`La agenda oficial incluye “${card.agendaItem}” para su consideración.`],
    whyItMatters: "SimpleCity todavía está preparando un resumen detallado. El punto de la agenda oficial está disponible ahora para que no se omita.",
    whoItAffects: ["No indicado en el documento fuente."],
    status: card.status,
    commentWindow: {
      opens: "No indicado en el documento fuente.",
      closes: "No indicado en el documento fuente."
    },
    howToAct: {
      attend: "Consulta la fuente oficial de la reunión para obtener detalles de participación.",
      email: "No indicado en el documento fuente.",
      submitComment: "No indicado en el documento fuente."
    }
  };
}

export function officialSourceFallbackSummary(
  meeting: LlmReadyMeeting,
  items: AgendaItem[]
): SimpleCitySummary {
  const cards = items.map((item) => fallbackCard(meeting, item));
  return {
    meetingSummary: {
      title: meeting.title,
      date: meeting.dateText || "Not listed in the source document.",
      status: meeting.status,
      oneSentenceSummary: "Official agenda items are available while detailed SimpleCity summaries are being prepared."
    },
    cards,
    translations: {
      es: {
        meeting: {
          title: meeting.title,
          meetingType: meeting.meetingType
        },
        cards: cards.map(fallbackTranslation)
      }
    }
  };
}

function appendSummary(target: SimpleCitySummary, addition: SimpleCitySummary) {
  const existingIds = new Set(
    target.cards.flatMap((card) => card.sourceItemId ? [card.sourceItemId] : [])
  );
  const targetTranslations = target.translations?.es?.cards || target.cards.map(() => null);
  const additionTranslations = addition.translations?.es?.cards || [];
  const cards = [...target.cards];
  const translations = [...targetTranslations];

  for (const [index, card] of addition.cards.entries()) {
    if (card.sourceItemId && existingIds.has(card.sourceItemId)) continue;
    if (card.sourceItemId) existingIds.add(card.sourceItemId);
    cards.push(card);
    translations.push(additionTranslations[index] || null);
  }

  return {
    ...target,
    cards,
    translations:
      target.translations?.es || addition.translations?.es
        ? {
            es: {
              meeting: target.translations?.es?.meeting || addition.translations?.es?.meeting,
              cards: translations
            }
          }
        : undefined
  };
}

export async function completeAgendaItemCoverage(
  meeting: LlmReadyMeeting,
  initial: SummaryResult | null,
  options: {
    generate?: (meeting: LlmReadyMeeting) => Promise<SummaryResult>;
  } = {}
) {
  let summary = initial?.summary || officialSourceFallbackSummary(meeting, []);
  const retryRaw: unknown[] = [];
  const retryErrors: string[] = [];
  const retriedItemIds: string[] = [];

  const recordRetry = async (items: AgendaItem[]) => {
    if (!options.generate || items.length === 0) return;
    for (const item of items) {
      if (!retriedItemIds.includes(item.externalId)) retriedItemIds.push(item.externalId);
    }
    try {
      const retry = await options.generate(agendaItemRetryMeeting(meeting, items));
      retryRaw.push(retry.raw);
      summary = appendSummary(summary, retry.summary);
    } catch (error) {
      retryErrors.push(
        `${items.map((item) => item.externalId).join(", ")}: ${
          error instanceof Error ? error.message : "Unknown item-summary error"
        }`
      );
    }
  };

  const uncovered = uncoveredAgendaItems(meeting, summary);
  if (options.generate && uncovered.length > 0) {
    // Recover all missing items as one logical request. generateSummaryForMeeting
    // will split this meeting into bounded source-size batches when necessary. This
    // avoids launching one paid request per missing card after a partial response.
    await recordRetry(uncovered);

    // A provider can return valid JSON while omitting a few items. Give only those
    // residual items one bounded, small-batch pass instead of repeating the entire
    // meeting or immediately publishing placeholders.
    const remaining = uncoveredAgendaItems(meeting, summary);
    const recoveryBatches = Array.from(
      { length: Math.min(4, Math.ceil(remaining.length / 3)) },
      (_, index) => remaining.slice(index * 3, index * 3 + 3)
    );
    for (const batch of recoveryBatches) {
      await recordRetry(batch);
    }
  }

  const missing = uncoveredAgendaItems(meeting, summary);
  if (missing.length > 0) {
    summary = appendSummary(summary, officialSourceFallbackSummary(meeting, missing));
  }

  return {
    summary,
    raw: {
      primarySummary: initial?.raw || null,
      itemCoverageRetries: retryRaw,
      officialSourceFallbackItemIds: missing.map((item) => item.externalId)
    },
    fallbackItemIds: missing.map((item) => item.externalId),
    retriedItemIds,
    retryErrors
  };
}
