import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { cookies } from "next/headers";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { SearchAndFilters } from "@/components/SearchAndFilters";
import { SummaryCard } from "@/components/SummaryCard";
import { CATEGORIES, CATEGORY_DEFINITIONS } from "@/lib/constants";
import {
  getActiveAnnouncements,
  getDecisionCardPage,
  getPublishedCardCount,
  getPublishedCardPreview,
  getUpcomingDecisionSnapshot
} from "@/lib/db/queries";
import {
  ALL_JURISDICTIONS_SLUG,
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionLabel,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";
import {
  compareCardsByPublicInterest,
  isPublicInterestCard,
  publicAgendaTitle,
  selectDiverseCards
} from "@/lib/utils/civicPriority";
import { displayMeetingTitle } from "@/lib/utils/meetingDisplay";
import {
  formatDisplayDate,
  isMeetingInProgress,
  isUpcomingMeetingDate,
  meetingDateParts
} from "@/lib/utils/date";
import type { SummaryCardRow } from "@/lib/types";
import { categoryShortLabel, t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { normalizeSummaryPoints } from "@/lib/utils/summaryPoints";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";

const FEATURE_ARTICLE_URL =
  "https://www.losaltosonline.com/news/using-ai-students-create-website-that-summarizes-local-government-agendas/article_63d31ed4-6317-434e-a77b-1c8f38d5d1a6.html";

export const revalidate = 300;

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const locale = seoLocale((await searchParams).lang);
  const title =
    locale === "es"
      ? "SimpleCity | Decisiones locales fáciles de entender"
      : "SimpleCity | Easy-to-understand local decisions";
  const description =
    locale === "es"
      ? "Encuentra próximas decisiones del gobierno local, reuniones públicas, fuentes oficiales y formas de participar en comunidades del Área de la Bahía."
      : "Find upcoming local government decisions, public meetings, official sources, and ways to participate across Bay Area communities.";
  const urls = localizedSeoUrls("/", locale);

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages },
    openGraph: { title, description, type: "website", url: urls.canonical, siteName: "SimpleCity" },
    twitter: { card: "summary", title, description }
  };
}

function matchesSearch(card: SummaryCardRow, search: string) {
  if (!search) return true;
  const haystack = [
    card.agenda_item,
    ...normalizeSummaryPoints(card.what_is_happening),
    card.why_it_matters,
    card.meetings?.title,
    ...(card.category_tags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

type MeetingPreviewCard = SummaryCardRow & {
  meetings: NonNullable<SummaryCardRow["meetings"]>;
};

/**
 * Meetings a reader could still attend, soonest first.
 *
 * Timing comes from the parsed date, not the scraped `status` — that column
 * still says "Upcoming" for meetings months past. Cancellation is the one thing
 * `status` is trusted for, since a cancelled meeting is not attendable no matter
 * what its date says.
 */
function getMeetingPreviewCards(cards: SummaryCardRow[]) {
  const seen = new Set<string>();
  const meetings: MeetingPreviewCard[] = [];

  for (const card of cards) {
    const meeting = card.meetings;
    if (!meeting) continue;
    if (/^cancel{1,2}ed$/i.test(String(meeting.status || "").trim())) continue;
    if (!isUpcomingMeetingDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text))
      continue;

    const key = meeting.id || `${meeting.title}-${meeting.date_text || meeting.meeting_datetime || ""}`;
    if (seen.has(key)) continue;

    seen.add(key);
    meetings.push(card as MeetingPreviewCard);
  }

  return meetings
    .sort((a, b) => {
      const aParts = meetingDateParts(a.meetings.date_text, a.meetings.meeting_datetime);
      const bParts = meetingDateParts(b.meetings.date_text, b.meetings.meeting_datetime);
      return (aParts?.iso || "").localeCompare(bParts?.iso || "");
    })
    .slice(0, 5);
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ q?: string; jurisdiction?: string; lang?: string }>;
}) {
  const [params, locale, cookieStore] = await Promise.all([
    searchParams,
    getRequestLocale(),
    cookies()
  ]);
  const search = (params.q || "").trim();
  const jurisdiction = normalizeJurisdictionSelection(
    params.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const hasSearch = search.length > 0;
  const cardResultPromise = hasSearch
    ? getDecisionCardPage({ jurisdiction, locale, search })
    : Promise.all([
        getPublishedCardPreview(jurisdiction, locale),
        getPublishedCardCount(jurisdiction)
      ]).then(([previewCards, publishedCardCount]) => ({
        cards: previewCards,
        totalCount: Math.max(publishedCardCount, previewCards.length)
      }));
  const [cardResult, announcements, upcomingSnapshot] = await Promise.all([
    cardResultPromise,
    getActiveAnnouncements(ALL_JURISDICTIONS_SLUG),
    getUpcomingDecisionSnapshot(jurisdiction)
  ]);
  const cards = cardResult.cards;
  const availableCardCount = cardResult.totalCount;
  const filteredCards = hasSearch
    ? cards
    : cards.filter((card) => matchesSearch(card, search));
  const prioritizedCards = [...filteredCards].sort(compareCardsByPublicInterest);
  const publicInterestCards = prioritizedCards.filter(isPublicInterestCard);
  const decisionCards = selectDiverseCards(
    publicInterestCards.length > 0 ? publicInterestCards : prioritizedCards,
    4
  );
  const visibleCards = hasSearch ? prioritizedCards : decisionCards;
  // Both figures come from a query over every published card, not from the
  // preview above — the preview is a bounded pool for ranking, so counting inside
  // it would report whatever happened to fall in the window.
  const { openForCommentCount, nextMeetingIso } = upcomingSnapshot;
  const meetingPreviewCards = getMeetingPreviewCards(
    publicInterestCards.length > 0 ? publicInterestCards : prioritizedCards
  );
  const introLabel =
    jurisdiction === "all"
      ? locale === "es"
        ? "Reuniones públicas de varias jurisdicciones"
        : "Public meetings across jurisdictions"
      : locale === "es"
        ? `Reuniones públicas de ${jurisdictionLabel}`
        : `${jurisdictionLabel} public meetings`;
  const decisionSectionTitle =
    hasSearch
      ? locale === "es"
        ? `Resultados para "${search}"`
        : `Results for "${search}"`
      : locale === "es"
        ? "Decisiones que pueden afectar la vida diaria"
        : "Decisions that may affect daily life";
  const decisionSectionDescription = hasSearch
    ? locale === "es"
      ? `Decisiones que coinciden en ${jurisdictionLabel}, con las votaciones próximas primero.`
      : `Matching decisions in ${jurisdictionLabel}, with upcoming votes first.`
    : locale === "es"
      ? "Primero las próximas votaciones, luego las decisiones recientes que más afectan la vida diaria. Lo que aún acepta comentarios está marcado."
      : "Upcoming votes first, then the recent decisions most likely to change daily life. Anything still open to comment is marked.";
  // The soonest meeting on the docket — the masthead leads with it because "when
  // can I show up?" is the question that brings people here.
  const nextMeetingParts = meetingDateParts(null, nextMeetingIso, locale);
  const nextMeetingUnderway = isMeetingInProgress(null, nextMeetingIso);

  return (
    <div>
      <section className="civic-hero">
        <div
          className={`section-shell grid gap-x-10 gap-y-6 ${
            hasSearch ? "py-7" : "py-9 sm:py-11 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
          }`}
        >
          <div className="max-w-[34ch]">
            <p className="label-eyebrow">{introLabel}</p>
            <h1 className="page-title mt-2.5">
              {locale === "es"
                ? "Mira qué está decidiendo tu gobierno local."
                : "See what your local government is deciding."}
            </h1>
            <p className="page-copy mt-3.5 max-w-[46ch]">
              {locale === "es"
                ? "Resúmenes en lenguaje claro, con enlace a la fuente oficial, y las formas de opinar antes de la votación."
                : "Plain-language summaries linked to the official record, and the ways to weigh in before the vote."}
            </p>

            {/* The live state of the docket. Same state vocabulary as the rows
                below, so the marker colors mean one thing across the page. */}
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              {openForCommentCount > 0 ? (
                <span className="state state--open">
                  {locale === "es"
                    ? pluralize(openForCommentCount, "decisión abierta a comentarios", "decisiones abiertas a comentarios")
                    : `${openForCommentCount} ${openForCommentCount === 1 ? "decision is" : "decisions are"} open for comment`}
                </span>
              ) : null}
              {nextMeetingParts ? (
                <span className={nextMeetingUnderway ? "state state--open" : "state state--upcoming"}>
                  {nextMeetingUnderway
                    ? locale === "es"
                      ? "Reunión en curso ahora"
                      : "Meeting in session now"
                    : `${locale === "es" ? "Próxima reunión " : "Next meeting "}${nextMeetingParts.month} ${nextMeetingParts.day}`}
                </span>
              ) : (
                // Said plainly rather than left blank: an empty status area reads
                // as broken, and "none posted" is a real answer for a jurisdiction
                // whose next agenda has not been published yet.
                <span className="state state--decided">
                  {locale === "es" ? "Ninguna reunión programada aún" : "No upcoming meetings posted yet"}
                </span>
              )}
            </div>

            {/* Sits with the intro rather than beside the search box: it is part
                of who we are, not a way to find a decision. */}
            {!hasSearch ? (
              <a
                href={FEATURE_ARTICLE_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate underline decoration-[color:var(--rule-strong)] underline-offset-4 transition-colors hover:text-brand hover:decoration-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {locale === "es"
                  ? "Presentado en el Los Altos Town Crier"
                  : "Featured in the Los Altos Town Crier"}
                <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
              </a>
            ) : null}
          </div>

          <div className="lg:w-[440px] lg:justify-self-end">
            <SearchAndFilters
              action={`/decisions?jurisdiction=${toPublicJurisdictionSlug(jurisdiction)}`}
              resultCount={filteredCards.length}
              search={search}
              locale={locale}
            />
          </div>
        </div>
      </section>

      {announcements.length > 0 ? (
        <section className="section-shell py-6 sm:py-8">
          <AnnouncementBanner announcements={announcements} locale={locale} />
        </section>
      ) : null}

      <section
        id="decisions"
        className={`section-shell scroll-mt-24 pb-6 sm:pb-8 ${
          announcements.length === 0 ? "pt-6 sm:pt-8" : "pt-0"
        }`}
      >
        <div id="search-results" className="scroll-mt-24">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <h2 className="section-title">{decisionSectionTitle}</h2>
              <p className="section-intro">{decisionSectionDescription}</p>
            </div>
            {hasSearch ? (
              <p className="count-badge shrink-0">
                {filteredCards.length === 1
                  ? locale === "es"
                    ? "1 decisión coincidente"
                    : "1 matching decision"
                  : locale === "es"
                    ? `${filteredCards.length} decisiones coincidentes`
                    : `${filteredCards.length} matching decisions`}
              </p>
            ) : null}
          </div>
        </div>
        {filteredCards.length > 0 ? (
          <div className="docket-stack">
            {visibleCards.map((card) => (
              <SummaryCard key={card.id} card={card} locale={locale} expandOnOutcome={false} />
            ))}
          </div>
        ) : (
          <div className="quiet-card px-6 py-10 text-center">
            <h3 className="text-[17px] font-semibold text-ink">
              {hasSearch ? t(locale, "noMatchingDecisions") : t(locale, "noCardsYet")}
            </h3>
            <p className="prose-summary mx-auto mt-2 max-w-[52ch]">
              {hasSearch
                ? t(locale, "trySearching")
                : locale === "es"
                  ? `Todavía no hay decisiones publicadas de ${jurisdictionLabel}. Prueba otra jurisdicción en el menú de arriba.`
                  : `No published decisions for ${jurisdictionLabel} yet. Try another jurisdiction from the menu above.`}
            </p>
          </div>
        )}
        {!hasSearch && availableCardCount > 4 ? (
          <Link href="/decisions" className="action-link mt-5">
            {t(locale, "viewAllDecisions")}
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </section>

      {meetingPreviewCards.length > 0 ? (
        <section className="section-shell rule-top py-9">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <h2 className="section-title">
                {locale === "es" ? "Próximas reuniones públicas" : "Upcoming public meetings"}
              </h2>
              <p className="section-intro">
                {locale === "es"
                  ? "Dónde se deciden los puntos anteriores. Todas están abiertas al público."
                  : "Where the items above get decided. All are open to the public."}
              </p>
            </div>
            <Link href="/meetings" className="action-link shrink-0">
              {t(locale, "viewAllMeetings")}
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="docket-stack">
            {meetingPreviewCards.map((card) => {
              const meeting = card.meetings;
              const parts = meetingDateParts(
                meeting.date_text,
                meeting.meeting_datetime,
                locale
              );

              return (
                <article key={meeting.id} className="docket-item docket-row">
                  <div className="date-rail date-rail--upcoming">
                    {parts ? (
                      <>
                        <span className="rail-month">{parts.month}</span>
                        <span className="rail-day">{parts.day}</span>
                      </>
                    ) : (
                      <span className="rail-month">—</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="committee-eyebrow">
                      {meeting.jurisdiction_name || card.jurisdiction_name || jurisdictionLabel}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-[17px] font-semibold leading-[1.3] tracking-tight text-ink">
                      {displayMeetingTitle(
                        meeting,
                        locale === "es" ? "Reunión no indicada" : "Meeting not listed",
                        locale
                      )}
                    </h3>
                    <p className="meta-line mt-2">
                      <span className="record-value">
                        {formatDisplayDate(
                          meeting.date_text,
                          meeting.meeting_datetime,
                          meeting.time_text
                        )}
                      </span>
                      <span className="min-w-0">
                        {t(locale, "connectedDecision")}:{" "}
                        <Link
                          href={`/cards/${card.id}`}
                          className="font-medium text-brand underline decoration-brand/30 underline-offset-4 transition-colors hover:decoration-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                          {publicAgendaTitle(card)}
                        </Link>
                      </span>
                    </p>
                  </div>
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="action-secondary-sm col-start-2 w-fit sm:col-start-3"
                  >
                    {t(locale, "meetingDetails")}
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="section-shell rule-top py-9 pb-14">
        <h2 className="section-title">{t(locale, "everydayImpactTitle")}</h2>
        <p className="section-intro">
          {locale === "es"
            ? "Sigue un tema que te importe."
            : "Follow a subject you care about."}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category) => {
            const definition = CATEGORY_DEFINITIONS[category];
            const Icon = definition.icon;
            return (
              <Link
                key={category}
                href={`/topics/${definition.slug}`}
                className="quiet-card interactive-card group flex items-center gap-2.5 px-3 py-2.5 focus-visible:focus-ring"
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0 text-quiet transition-colors group-hover:text-brand" />
                <span className="text-[14px] font-medium leading-5 text-ink">
                  {categoryShortLabel(locale, category)}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
