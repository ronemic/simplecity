import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import { CATEGORIES } from "@/lib/constants";
import { CARD_STATUSES } from "@/lib/cardStatus";
import type { AgendaItem, LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";
import { findAgendaItemForCard } from "@/lib/scraper/agendaItemContext";
import { cleanText } from "@/lib/utils/slug";

const TopicResultSchema = z.object({
  cards: z.array(
    z.object({
      cardIndex: z.number().int().nonnegative(),
      categoryTags: z.array(z.enum(CATEGORIES)).min(1).max(2),
      status: z.enum(CARD_STATUSES)
    })
  )
});

export type TopicValidationCandidate = {
  cardIndex: number;
  item: AgendaItem;
  meetingStatus: LlmReadyMeeting["status"];
  context: string;
};

export const TOPIC_VALIDATION_SYSTEM_PROMPT = `You validate civic agenda-card topics using only the isolated official agenda-item context supplied for each card.

Allowed topics:
Housing
Transportation
Public Safety
Parks & Environment
Budget & Taxes
Business & Development
Schools & Youth
City Services

Topic meanings:
- Housing: homes, rent, zoning, and housing affordability.
- Transportation: streets, bridges, parking, transit, traffic, and mobility.
- Public Safety: police, fire, emergency response, and concrete safety measures.
- Parks & Environment: parks, trees, solid waste, recycling, water or sewer infrastructure and operations, climate, and environmental quality.
- Budget & Taxes: budgets, taxes, fees, revenue, and broad fiscal policy.
- Business & Development: economic development, commercial activity, procurement, and contracts when no more specific service topic controls.
- Schools & Youth: education, childcare, and youth programs.
- City Services: government operations, commissions, administration, and resident services.

For every supplied card:
- Classify from the complete item context, including its official title, recommended action, description, and linked supporting-report text.
- Make a fresh classification from the official context; do not assume a previous model's choice was correct.
- Do not classify from an isolated word, the meeting body's name, or general knowledge.
- Return exactly one primary topic unless the context clearly supports a second distinct impact.
- Put the most specific topic first and return no more than two topics.
- Add a second topic only when the item itself gives that second subject comparable weight; incidental examples or subprojects in a supporting report do not justify another topic.
- Contracts and spending use the subject area's topic when a more specific public service is clear; use Business & Development or Budget & Taxes only when that is the actual focus.
- Business & Development requires economic development or commercial activity to be a central subject; incidental mentions of businesses, development, customers, contracts, or funding are insufficient.
- Classify a work plan by the substantive service area it governs when the item context identifies one. Use City Services for a work plan only when its central subject is general governance or administration rather than a specific service area.
- When the current action centrally concerns a budget, tax, rate, fee, service charge, revenue, or tax-roll collection, use Budget & Taxes even if the money funds a more specific service.
- Verify status from the current body's item-specific recommended action, not from public-comment availability or general meeting instructions.
- Treat an explicit agenda section as item-specific context. For example, an item under an Approval of Minutes section is a formal approval even if a separate recommendation sentence is absent.
- Consider every action requested of the current body in the complete recommendation. Do not let an opening informational clause override a later decision or discussion clause.
- When multiple current-body actions are listed, use the most consequential supported status: a possible formal decision outranks discussion, and discussion outranks receipt of information.
- "Receive" an informational report or presentation is Information only only when the current body is not also asked to discuss, direct, select, approve, adopt, or make another decision. Public comment or a later vote by another body does not change this status.
- Use Under discussion when the current body is asked only to discuss, review, study, or provide direction.
- Use Routine approval only for approval of meeting minutes, approval of the agenda or order of business, or another explicitly procedural unanimous-consent action. Do not use it for a substantive contract, budget, permit, appointment, award, policy, or other decision merely because it appears on a consent calendar.
- Use Upcoming vote when the current body is asked to approve, adopt, award, authorize, appoint, select, consider adoption, or make another substantive formal decision at this meeting, even if the agenda does not mention a roll-call vote and even if continuing the item is an alternative.
- For an upcoming meeting, never transfer Passed or Tabled from historical minutes or supporting reports.
- Return every cardIndex exactly once.

Return only JSON in this shape:
{"cards":[{"cardIndex":0,"categoryTags":["Transportation"],"status":"Information only"}]}`;

function attachmentContext(item: AgendaItem) {
  const text = (item.attachments || [])
    .map((document) => cleanText(document.extractedText || ""))
    .filter(Boolean)
    .join("\n\n");
  return text.slice(0, 4000);
}

function isolatedItemContext(item: AgendaItem) {
  const linkedContext = attachmentContext(item);
  return [
    `Agenda item: ${item.agendaNumber || "Unnumbered"}`,
    `Agenda section: ${item.itemType || "Not listed in the source document."}`,
    `Official title: ${item.title || "Not listed in the source document."}`,
    `Recommended action: ${item.action || item.recommendedAction || "Not listed in the source document."}`,
    `Official result: ${item.result || "Not listed in the source document."}`,
    `Official item context: ${item.rowText || "Not listed in the source document."}`,
    ...(linkedContext ? [`Linked supporting-report context: ${linkedContext}`] : [])
  ].join("\n");
}

export function topicValidationCandidates(
  meeting: LlmReadyMeeting,
  summary: SimpleCitySummary
): TopicValidationCandidate[] {
  return summary.cards.flatMap((card, cardIndex) => {
    const item =
      findAgendaItemForCard(card.agendaItem, meeting.items || []) ||
      findAgendaItemForCard(
        `${card.agendaItem} ${card.whatIsHappening.join(" ")}`,
        meeting.items || []
      );
    if (!item) return [];
    return [
      {
        cardIndex,
        item,
        meetingStatus: meeting.status,
        context: isolatedItemContext(item)
      }
    ];
  });
}

export function buildTopicValidationPrompt(candidates: TopicValidationCandidate[]) {
  return [
    "Verify and, when necessary, correct the topics for these cards.",
    "Each block contains only the official context for that one matched agenda item.",
    ...candidates.map((candidate) =>
      [
        `CARD ${candidate.cardIndex}`,
        `Meeting status: ${candidate.meetingStatus}`,
        candidate.context
      ].join("\n")
    )
  ].join("\n\n");
}

export function parseTopicValidation(
  content: string,
  candidates: TopicValidationCandidate[]
) {
  const parsed = TopicResultSchema.parse(JSON.parse(jsonrepair(content)));
  const expectedIndexes = new Set(candidates.map((candidate) => candidate.cardIndex));
  const returnedIndexes = parsed.cards.map((card) => card.cardIndex);

  if (
    returnedIndexes.length !== expectedIndexes.size ||
    new Set(returnedIndexes).size !== returnedIndexes.length ||
    returnedIndexes.some((index) => !expectedIndexes.has(index))
  ) {
    throw new Error("Topic validator did not return every matched card exactly once.");
  }

  for (const card of parsed.cards) {
    const candidate = candidates.find((value) => value.cardIndex === card.cardIndex);
    if (
      candidate?.meetingStatus === "Upcoming" &&
      (card.status === "Passed" || card.status === "Tabled")
    ) {
      throw new Error("Topic validator returned a historical outcome for an upcoming meeting.");
    }
  }

  return parsed.cards;
}

export function applyTopicValidation(
  summary: SimpleCitySummary,
  verified: Array<{ cardIndex: number; categoryTags: string[]; status: string }>
): SimpleCitySummary {
  const verifiedByIndex = new Map(verified.map((card) => [card.cardIndex, card]));
  return {
    ...summary,
    cards: summary.cards.map((card, cardIndex) => {
      const verification = verifiedByIndex.get(cardIndex);
      return {
        ...card,
        categoryTags: verification?.categoryTags || card.categoryTags,
        status: verification?.status || card.status
      };
    }),
    translations: summary.translations?.es
      ? {
          ...summary.translations,
          es: {
            ...summary.translations.es,
            cards: summary.translations.es.cards.map((card, cardIndex) => {
              const verification = verifiedByIndex.get(cardIndex);
              return card && verification ? { ...card, status: verification.status } : card;
            })
          }
        }
      : summary.translations
  };
}
