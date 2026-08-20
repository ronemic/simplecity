import {
  getDecisionCardPage,
  getPublishedCardPreview
} from "@/lib/db/queries";
import { normalizeJurisdictionSelection } from "@/lib/config/jurisdictions";
import type { Locale } from "@/lib/i18n";
import type { SummaryCardRow } from "@/lib/types";
import {
  compareCardsByPublicInterest,
  isPublicInterestCard,
  selectDiverseCards
} from "@/lib/utils/civicPriority";
import { isUpcomingMeetingDate, meetingDateParts } from "@/lib/utils/date";

const CACHE_SECONDS = 300;

function selectMeetingCards(cards: SummaryCardRow[]) {
  const seen = new Set<string>();
  return cards
    .filter((card) => {
      const meeting = card.meetings;
      if (!meeting || /^cancel{1,2}ed$/i.test(String(meeting.status || "").trim())) return false;
      if (!isUpcomingMeetingDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)) return false;
      const key = meeting.id || `${meeting.title}-${meeting.date_text || meeting.meeting_datetime || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aParts = meetingDateParts(a.meetings?.date_text, a.meetings?.meeting_datetime);
      const bParts = meetingDateParts(b.meetings?.date_text, b.meetings?.meeting_datetime);
      return (aParts?.iso || "").localeCompare(bParts?.iso || "");
    })
    .slice(0, 5);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jurisdiction: string; locale: string }> }
) {
  const { jurisdiction: rawJurisdiction, locale: rawLocale } = await context.params;
  const jurisdiction = normalizeJurisdictionSelection(rawJurisdiction);
  const locale: Locale = rawLocale === "es" ? "es" : "en";
  const search = new URL(request.url).searchParams.get("q")?.trim() || "";

  const cardResult = search
    ? await getDecisionCardPage({ jurisdiction, locale, search })
    : await getPublishedCardPreview(jurisdiction, locale).then((cards) => ({
        cards,
        // The homepage only needs to know whether more than four exist. Avoid
        // a separate exact COUNT query on every cold cache fill.
        totalCount: cards.length
      }));
  const prioritizedCards = [...cardResult.cards].sort(compareCardsByPublicInterest);
  const publicInterestCards = prioritizedCards.filter(isPublicInterestCard);
  const preferredCards = publicInterestCards.length > 0 ? publicInterestCards : prioritizedCards;
  const decisionCards = search ? prioritizedCards : selectDiverseCards(preferredCards, 4);
  const meetingCards = selectMeetingCards(preferredCards);

  return Response.json(
    {
      cardResult: {
        cards: decisionCards,
        meetingCards,
        totalCount: cardResult.totalCount
      },
      // Keep already-open tabs running the previous client bundle compatible
      // during a rolling deploy, without restoring the slow snapshot queries.
      upcomingSnapshot: { openForCommentCount: 0, nextMeetingIso: null }
    },
    {
      headers: {
        "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`,
        "CDN-Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`
      }
    }
  );
}
