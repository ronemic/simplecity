import Link from "next/link";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { SearchAndFilters } from "@/components/SearchAndFilters";
import { SummaryCard } from "@/components/SummaryCard";
import { CATEGORIES, CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import { getActiveAnnouncements, getPublishedCards } from "@/lib/db/queries";
import {
  getJurisdictionLabel,
  normalizeJurisdictionSelection
} from "@/lib/config/jurisdictions";
import { formatCompactDisplayDate } from "@/lib/utils/date";
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

function isListed(value?: string | null) {
  return Boolean(value && !/not listed/i.test(value));
}

function isActionable(card: SummaryCardRow) {
  return (
    card.status === "Upcoming vote" ||
    card.status === "Under discussion" ||
    card.meetings?.status === "Upcoming" ||
    isListed(card.comment_window_closes)
  );
}

const TOPIC_LABELS: Partial<Record<CategoryName, string>> = {
  Transportation: "Transport",
  "Public Safety": "Safety",
  "Parks & Environment": "Parks",
  "Budget & Taxes": "Budget",
  "Business & Development": "Business",
  "Schools & Youth": "Schools",
  "City Services": "Services"
};

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ q?: string; jurisdiction?: string }>;
}) {
  const params = await searchParams;
  const search = (params.q || "").trim();
  const jurisdiction = normalizeJurisdictionSelection(params.jurisdiction);
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const hasSearch = search.length > 0;
  const [cards, announcements] = await Promise.all([
    getPublishedCards(jurisdiction),
    getActiveAnnouncements(jurisdiction)
  ]);
  const filteredCards = cards.filter((card) => matchesSearch(card, search));
  const upcomingCards = filteredCards.filter(isActionable).slice(0, 4);
  const recentCards = filteredCards.slice(0, 4);
  const decisionCards = upcomingCards.length > 0 ? upcomingCards : recentCards;
  const visibleCards = hasSearch ? filteredCards : decisionCards;
  const openForCommentCount = filteredCards.filter((card) => isListed(card.comment_window_closes)).length;
  const upcomingMeetingCount = new Set(
    filteredCards
      .filter((card) => card.meetings?.status === "Upcoming" || card.status === "Upcoming vote")
      .map((card) => card.meeting_id || card.meetings?.id || card.id)
  ).size;
  const nextDeadlineCard = filteredCards.find((card) => isListed(card.comment_window_closes)) || decisionCards[0];
  const nextDeadline = nextDeadlineCard
    ? isListed(nextDeadlineCard.comment_window_closes)
      ? formatCompactDisplayDate(nextDeadlineCard.comment_window_closes)
      : formatCompactDisplayDate(nextDeadlineCard.meetings?.date_text, nextDeadlineCard.meetings?.meeting_datetime)
    : "TBD";
  const inputCount = openForCommentCount || decisionCards.length;
  const inputText = inputCount === 1 ? "1 decision needs your input" : `${inputCount} decisions need your input`;

  return (
    <div>
      <section className="bg-newsprint">
        <div
          className={`section-shell flex flex-col items-center justify-center text-center ${
            hasSearch ? "gap-4 py-6 sm:py-8" : "min-h-[690px] gap-6 py-10 sm:gap-8 sm:py-20"
          }`}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-civic/20 bg-[#eef5ff] px-5 py-2 text-base font-bold text-[#1646b8]">
            <span aria-hidden className="status-dot-pulse" />
            {jurisdictionLabel} · {inputText}
          </div>

          {!hasSearch ? (
            <div>
              <h1 className="text-balance text-[56px] font-black leading-[0.98] text-ink sm:text-[74px] lg:text-[84px]">
                Your city,
                <span className="block text-[#2f65e8]">made simple.</span>
              </h1>
              <p className="mx-auto mt-7 max-w-3xl text-balance text-xl font-medium leading-8 text-black/[0.74] sm:text-2xl sm:leading-9">
                See what City Hall is deciding, understand how it affects you, and speak up before it&apos;s too late.
              </p>
            </div>
          ) : null}

          <div className="w-full">
            <SearchAndFilters
              jurisdiction={jurisdiction}
              resultCount={filteredCards.length}
              search={search}
            />
          </div>

          {!hasSearch ? (
            <div className="grid w-full max-w-[740px] overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm sm:grid-cols-3">
              {[
                { value: openForCommentCount, label: "Open for comment" },
                { value: upcomingMeetingCount, label: "Upcoming meetings" },
                { value: nextDeadline, label: "Next deadline" }
              ].map((stat) => (
                <div key={stat.label} className="border-t border-black/10 px-6 py-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
                  <p className="text-3xl font-black leading-none text-ink">{stat.value}</p>
                  <p className="mt-2 text-base font-semibold leading-5 text-black/[0.56]">{stat.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section id="decisions" className="section-shell scroll-mt-24 py-10">
        <AnnouncementBanner announcements={announcements} />
        <div id="search-results" className="scroll-mt-24">
          <div className="mb-7 mt-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="label-eyebrow text-black/55">{hasSearch ? "Search results" : "Decisions"}</p>
              <h2 className="mt-1 text-3xl font-black leading-tight text-ink">
                {hasSearch ? `Results for "${search}"` : "What needs your attention"}
              </h2>
            </div>
            {hasSearch ? (
              <p className="rounded-full border border-civic/15 bg-[#eef5ff] px-4 py-2 text-sm font-bold text-[#1646b8]">
                {filteredCards.length === 1 ? "1 matching decision" : `${filteredCards.length} matching decisions`}
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-4">
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

      <section className="section-shell pb-16 pt-12">
        <div className="mb-5">
          <p className="label-eyebrow text-black/55">Browse by topic</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
          {CATEGORIES.map((category) => {
            const definition = CATEGORY_DEFINITIONS[category];
            const Icon = definition.icon;
            return (
              <Link
                key={category}
                href={`/categories/${definition.slug}?jurisdiction=${jurisdiction}`}
                className="group flex min-h-[118px] flex-col items-center justify-center gap-3 rounded-lg border border-black/10 bg-white px-4 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_12px_28px_rgba(23,23,23,0.08)] focus-visible:focus-ring"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-black/[0.025] text-black/[0.74] transition group-hover:bg-civic/10 group-hover:text-civic">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="text-base font-semibold leading-5 text-black/[0.78]">
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
