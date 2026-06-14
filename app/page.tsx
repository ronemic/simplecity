import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { SearchAndFilters } from "@/components/SearchAndFilters";
import { SummaryCard } from "@/components/SummaryCard";
import { CATEGORIES, CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import { getActiveAnnouncements, getPublishedCards } from "@/lib/db/queries";
import {
  ALL_JURISDICTIONS_SLUG,
  getJurisdictionLabel,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { hasCommentOptionInfo } from "@/lib/utils/commentDeadline";
import {
  compareCardsByPublicInterest,
  isPublicInterestCard,
  publicAgendaTitle
} from "@/lib/utils/civicPriority";
import { formatDisplayDate } from "@/lib/utils/date";
import type { SummaryCardRow } from "@/lib/types";

export const revalidate = 300;

function matchesSearch(card: SummaryCardRow, search: string) {
  if (!search) return true;
  const haystack = [
    card.agenda_item,
    card.what_is_happening,
    card.why_it_matters,
    card.meetings?.title,
    ...(card.category_tags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function hasCardCommentOptionInfo(card: SummaryCardRow) {
  return hasCommentOptionInfo({
    closes: card.comment_window_closes,
    actionTexts: [
      card.how_to_act_submit_comment,
      card.how_to_act_email
    ]
  });
}

const TOPIC_LABELS: Partial<Record<CategoryName, string>> = {
  Transportation: "Transportation",
  "Public Safety": "Public Safety",
  "Parks & Environment": "Parks & Environment",
  "Budget & Taxes": "Budget",
  "Business & Development": "Business",
  "Schools & Youth": "Schools",
  "City Services": "Public Services"
};

type MeetingPreviewCard = SummaryCardRow & {
  meetings: NonNullable<SummaryCardRow["meetings"]>;
};

function publicJurisdictionFromCard(card: SummaryCardRow) {
  const slug = card.jurisdiction_slug || card.meetings?.jurisdiction_slug || "foster-city";
  return slug === "san-mateo-city" ? "san-mateo" : slug;
}

function getMeetingPreviewCards(cards: SummaryCardRow[]) {
  const seen = new Set<string>();
  const meetings: MeetingPreviewCard[] = [];

  for (const card of cards) {
    const meeting = card.meetings;
    if (!meeting) continue;
    if (meeting.status !== "Upcoming" && card.status !== "Upcoming vote") continue;

    const key = meeting.id || `${meeting.title}-${meeting.date_text || meeting.meeting_datetime || ""}`;
    if (seen.has(key)) continue;

    seen.add(key);
    meetings.push(card as MeetingPreviewCard);
    if (meetings.length === 5) break;
  }

  return meetings;
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ q?: string; jurisdiction?: string }>;
}) {
  const params = await searchParams;
  const search = (params.q || "").trim();
  const jurisdiction = normalizeJurisdictionSelection(params.jurisdiction);
  const publicJurisdiction = toPublicJurisdictionSlug(jurisdiction);
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const hasSearch = search.length > 0;
  const [cards, announcements] = await Promise.all([
    getPublishedCards(jurisdiction),
    getActiveAnnouncements(ALL_JURISDICTIONS_SLUG)
  ]);
  const filteredCards = cards.filter((card) => matchesSearch(card, search));
  const prioritizedCards = [...filteredCards].sort(compareCardsByPublicInterest);
  const publicInterestCards = prioritizedCards.filter(isPublicInterestCard);
  const decisionCards =
    publicInterestCards.length > 0 ? publicInterestCards.slice(0, 4) : prioritizedCards.slice(0, 4);
  const visibleCards = hasSearch ? prioritizedCards : decisionCards;
  const commentOptionCount = filteredCards.filter((card) => hasCardCommentOptionInfo(card)).length;
  const upcomingMeetingCount = new Set(
    filteredCards
      .filter((card) => card.meetings?.status === "Upcoming" || card.status === "Upcoming vote")
      .map((card) => card.meeting_id || card.meetings?.id || card.id)
  ).size;
  const meetingPreviewCards = getMeetingPreviewCards(
    publicInterestCards.length > 0 ? publicInterestCards : prioritizedCards
  );
  const introLabel =
    jurisdiction === "all" ? "Public meetings across jurisdictions" : `${jurisdictionLabel} public meetings`;
  const summaryItems = [
    commentOptionCount > 0 ? pluralize(commentOptionCount, "decision lists a comment option", "decisions list comment options") : null,
    upcomingMeetingCount > 0 ? pluralize(upcomingMeetingCount, "upcoming meeting", "upcoming meetings") : null
  ].filter(Boolean);
  const summarySentence =
    summaryItems.length > 0
      ? summaryItems.join(" · ")
      : `${pluralize(filteredCards.length, "published decision", "published decisions")} available`;
  const decisionSectionTitle =
    hasSearch
      ? `Results for "${search}"`
      : "Decisions that may affect daily life";
  const decisionSectionDescription = hasSearch
    ? "Matching decisions from the currently selected jurisdiction, with everyday-impact items ranked first."
    : "Ranked to put budgets, housing, safety, transportation, services, public hearings, contracts, and fees before ceremonial or internal process items.";

  return (
    <div className="overflow-hidden">
      <section className="civic-hero">
        <div
          className={`section-shell relative z-10 grid gap-7 ${
            hasSearch ? "py-7 sm:py-8" : "py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-end lg:py-14"
          }`}
        >
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase text-[#9fc4f4]">
              {introLabel}
            </p>
            <h1 className="mt-4 text-balance text-[36px] font-black leading-[1.02] text-[#fffaf0] sm:text-[52px] lg:text-[56px]">
              See what your local government is deciding.
            </h1>
            <p className="mt-4 max-w-2xl text-balance text-base font-medium leading-7 text-[#d9e2ec] sm:mt-5 sm:text-xl sm:leading-8">
              Read plain-language summaries, check upcoming meetings and votes, and find ways to share your input.
            </p>
            <p className="mt-5 text-sm font-semibold text-[#aebdcc]">{summarySentence}</p>
          </div>

          <div className="rounded-[12px] border border-white/15 bg-[#0c1726]/70 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:p-5 lg:justify-self-stretch">
            <p className="mb-3 text-xs font-black uppercase text-[#9fc4f4]">
              Search official summaries
            </p>
            <SearchAndFilters
              jurisdiction={publicJurisdiction}
              resultCount={filteredCards.length}
              search={search}
            />
          </div>
        </div>
      </section>

      {announcements.length > 0 ? (
        <section className="section-shell py-6 sm:py-8">
          <AnnouncementBanner announcements={announcements} />
        </section>
      ) : null}

      <section id="decisions" className="section-shell scroll-mt-24 pb-6 sm:pb-8">
        <div id="search-results" className="scroll-mt-24">
          <div className="mb-5 flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="label-eyebrow text-civic">
                {hasSearch ? "Search results" : "Top public decisions"}
              </p>
              <h2 className="mt-2 text-3xl font-black leading-tight text-ink sm:text-4xl">
                {decisionSectionTitle}
              </h2>
              <p className="mt-2 text-base leading-7 text-black/[0.68]">{decisionSectionDescription}</p>
            </div>
            {hasSearch ? (
              <p className="rounded-md border border-civic/20 bg-white px-3 py-2 text-sm font-bold text-civic shadow-sm">
                {filteredCards.length === 1 ? "1 matching decision" : `${filteredCards.length} matching decisions`}
              </p>
            ) : (
              <p className="max-w-sm text-sm font-semibold leading-6 text-black/60 sm:text-right">
                {summarySentence}
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-3">
          {visibleCards.map((card) => (
            <SummaryCard key={card.id} card={card} />
          ))}
          {filteredCards.length === 0 ? (
            <div className="quiet-card p-8 text-center">
              <h3 className="text-lg font-semibold text-ink">{hasSearch ? "No matching decisions" : "No cards yet"}</h3>
              <p className="mt-2 text-sm leading-6 text-black/70">
                {hasSearch
                  ? "Try searching for a topic, department, meeting title, or everyday impact."
                  : `Once the scraper and summarizer run, official ${jurisdictionLabel} agenda cards will appear here.`}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {meetingPreviewCards.length > 0 ? (
        <section className="section-shell pb-8 pt-2">
          <div className="grid gap-5 border-y border-black/10 py-7 lg:grid-cols-[0.72fr_1fr] lg:items-start">
            <div>
              <p className="label-eyebrow text-civic">Upcoming meetings</p>
              <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">
                Meetings tied to the top decisions
              </h2>
              <p className="mt-3 max-w-md text-base leading-7 text-black/[0.68]">
                Upcoming meetings connected to the higher-impact cards shown first.
              </p>
              <Link
                href={`/meetings?jurisdiction=${publicJurisdiction}`}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-black text-civic underline-offset-4 hover:underline focus-visible:focus-ring"
              >
                View all meetings
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </div>

            <div className="divide-y divide-black/10 overflow-hidden rounded-lg border border-black/10 bg-white">
              {meetingPreviewCards.map((card) => {
                const meeting = card.meetings;

                return (
                  <article
                    key={meeting.id}
                    className="grid gap-3 p-4 transition hover:bg-[#f4f8fb] sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="flex items-center gap-2 text-sm font-black text-[#12365f]">
                      <CalendarDays aria-hidden className="h-4 w-4" />
                      <span>{formatDisplayDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-base font-black leading-snug text-ink">
                        {meeting.title}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-black/[0.58]">
                        {meeting.meeting_type || "Meeting type not listed"} ·{" "}
                        {meeting.jurisdiction_name || card.jurisdiction_name || jurisdictionLabel}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[#285f75]">
                        Connected decision: {publicAgendaTitle(card)}
                      </p>
                    </div>
                    <Link
                      href={`/meetings/${meeting.id}?jurisdiction=${publicJurisdictionFromCard(card)}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-md border border-black/15 px-3 py-2 text-sm font-bold text-ink transition hover:border-civic/30 hover:bg-civic/5 hover:text-civic focus-visible:focus-ring"
                    >
                      Meeting details
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section-shell pb-16 pt-8">
        <div className="mb-5 max-w-2xl">
          <p className="label-eyebrow text-civic">Browse by topic</p>
          <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">Find decisions by everyday impact</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category) => {
            const definition = CATEGORY_DEFINITIONS[category];
            const Icon = definition.icon;
            return (
              <Link
                key={category}
                href={`/categories/${definition.slug}?jurisdiction=${publicJurisdiction}`}
                className="group grid min-h-[88px] grid-cols-[2.75rem_1fr] items-center gap-3 rounded-lg border border-black/10 bg-white px-4 py-4 transition hover:border-civic/30 hover:bg-[#f4f8fb] focus-visible:focus-ring"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#eef3f6] text-[#12365f] transition group-hover:bg-civic/10 group-hover:text-civic">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="text-base font-black leading-5 text-ink">
                  {TOPIC_LABELS[category] || category}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
