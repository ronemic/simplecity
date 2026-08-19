import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, FileText, Landmark, Users } from "lucide-react";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { SearchAndFilters } from "@/components/SearchAndFilters";
import { SummaryCard } from "@/components/SummaryCard";
import { CATEGORIES, CATEGORY_DEFINITIONS, SCHOOL_CATEGORIES } from "@/lib/constants";
import {
  getDecisionCardPage,
  getPublishedCardCount,
  getPublishedCardPreview,
  getUpcomingDecisionSnapshot
} from "@/lib/db/queries";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictions,
  getJurisdictionLabel,
  isSchoolDistrictJurisdiction,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import {
  compareCardsByPublicInterest,
  isPublicInterestCard,
  publicAgendaTitle,
  selectDiverseCards
} from "@/lib/utils/civicPriority";
import { displayMeetingTitle, displayMeetingType } from "@/lib/utils/meetingDisplay";
import {
  formatDisplayDate,
  isMeetingInProgress,
  isUpcomingMeetingDate,
  meetingClockTime,
  meetingDateParts
} from "@/lib/utils/date";
import type { SummaryCardRow } from "@/lib/types";
import { categoryShortLabel, t, type Locale } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { normalizeSummaryPoints } from "@/lib/utils/summaryPoints";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";

const FEATURE_ARTICLE_URL =
  "https://www.losaltosonline.com/news/using-ai-students-create-website-that-summarizes-local-government-agendas/article_63d31ed4-6317-434e-a77b-1c8f38d5d1a6.html";
// Manually maintained from analytics. Last checked 2026-08-19; update the date
// when you revise the figure so it is obvious when it has gone stale.
const APPROX_USER_COUNT = "500+";
const APPROX_AGENDA_ITEMS_ANALYZED = "6800+";

// Rounds down to a round hundred and adds "+" once there is a hundred to show;
// below that the exact count is honest and "0+" is never rendered. Returns null
// for a stat with nothing worth stating -- null count (read failed) or zero.
function statValue(count: number | null, locale: string) {
  if (count === null || count <= 0) {
    return null;
  }

  const formatter = new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US");

  if (count >= 100) {
    return `${formatter.format(Math.floor(count / 100) * 100)}+`;
  }

  return formatter.format(count);
}

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

function loadHomepageData({
  jurisdiction,
  locale,
  search
}: {
  jurisdiction: JurisdictionSelection;
  locale: Locale;
  search: string;
}) {
  const cardResultPromise = search
    ? getDecisionCardPage({ jurisdiction, locale, search })
    : Promise.all([
        getPublishedCardPreview(jurisdiction, locale),
        getPublishedCardCount(jurisdiction)
      ]).then(([previewCards, publishedCardCount]) => ({
        cards: previewCards,
        totalCount: Math.max(publishedCardCount, previewCards.length)
      }));

  return {
    cardResultPromise,
    upcomingSnapshotPromise: getUpcomingDecisionSnapshot(jurisdiction)
  };
}

type HomepageData = ReturnType<typeof loadHomepageData>;

async function HeroStatus({
  data,
  locale
}: {
  data: HomepageData;
  locale: Locale;
}) {
  const [cardResult, upcomingSnapshot] = await Promise.all([
    data.cardResultPromise,
    data.upcomingSnapshotPromise
  ]);
  const { openForCommentCount, nextMeetingIso } = upcomingSnapshot;
  const nextMeetingParts = meetingDateParts(null, nextMeetingIso, locale);
  const nextMeetingUnderway = isMeetingInProgress(null, nextMeetingIso);
  const nextMeetingTime = meetingClockTime(nextMeetingIso, locale);
  const summaryItems = [
    openForCommentCount > 0
      ? locale === "es"
        ? pluralize(openForCommentCount, "decisión está abierta a comentarios", "decisiones están abiertas a comentarios")
        : pluralize(openForCommentCount, "decision is open for comment", "decisions are open for comment")
      : null,
    nextMeetingParts
      ? nextMeetingUnderway
        ? locale === "es"
          ? "Reunión en curso ahora"
          : "Meeting in session now"
        : `${locale === "es" ? "Próxima reunión " : "Next meeting "}${nextMeetingParts.month} ${nextMeetingParts.day}${
            nextMeetingTime ? `, ${nextMeetingTime}` : ""
          }`
      : null
  ].filter(Boolean);
  const summarySentence =
    summaryItems.length > 0
      ? summaryItems.join(" · ")
      : locale === "es"
        ? `${pluralize(cardResult.totalCount, "decisión publicada", "decisiones publicadas")} disponibles`
        : `${pluralize(cardResult.totalCount, "published decision", "published decisions")} available`;

  return <p className="mt-5 text-sm font-semibold text-[#aebdcc]">{summarySentence}</p>;
}

function GlanceStats({ locale }: { locale: Locale }) {
  // A stat with no value is one whose read failed or whose count is zero; drop it
  // rather than advertise it. Jurisdiction coverage plus the maintained user and
  // agenda-item counts are always present.
  const glanceStats = [
    {
      icon: Users,
      value: APPROX_USER_COUNT,
      label: locale === "es" ? "usuarios" : "users"
    },
    {
      icon: Landmark,
      value: statValue(getJurisdictions().length, locale),
      label: locale === "es" ? "jurisdicciones" : "jurisdictions"
    },
    {
      icon: FileText,
      value: APPROX_AGENDA_ITEMS_ANALYZED,
      label: locale === "es" ? "puntos de agenda analizados" : "agenda items analyzed"
    }
  ].filter((item): item is { icon: typeof Users; value: string; label: string } => item.value !== null);

  if (glanceStats.length === 0) return null;

  return (
    <div className="py-1 lg:-translate-y-4">
      <p className="mb-3 text-xs font-black uppercase tracking-wide text-[#9fc4f4]">
        {locale === "es" ? "SimpleCity de un vistazo" : "SimpleCity at a glance"}
      </p>
      <div
        className={`grid divide-x divide-white/15 ${
          glanceStats.length === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"
        }`}
      >
        {glanceStats.map((item) => (
          <div key={item.label} className="flex min-w-0 items-center gap-2 px-3 first:pl-0 last:pr-0 sm:px-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#182c45] sm:h-10 sm:w-10">
              <item.icon aria-hidden className="h-4 w-4 text-[#9fc4f4] sm:h-5 sm:w-5" />
            </span>
            <p className="min-w-0 leading-tight">
              <span className="block text-lg font-black text-white sm:text-xl">{item.value}</span>
              <span className="block text-[11px] font-semibold text-[#d9e2ec] sm:text-xs">
                {item.label}
              </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Holds the strip's height while the counts resolve, so the hero does not jump. */
function GlanceStatsLoading({ locale }: { locale: Locale }) {
  return (
    <div
      className="py-1 lg:-translate-y-4"
      aria-busy="true"
      aria-label={locale === "es" ? "Cargando estadísticas" : "Loading statistics"}
    >
      <p className="mb-3 text-xs font-black uppercase tracking-wide text-[#9fc4f4]">
        {locale === "es" ? "SimpleCity de un vistazo" : "SimpleCity at a glance"}
      </p>
      <div className="grid grid-cols-2 divide-x divide-white/15 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex min-w-0 items-center gap-2 px-3 first:pl-0 last:pr-0 sm:px-4">
            <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[#182c45] sm:h-10 sm:w-10" />
            <p className="min-w-0 flex-1 leading-tight">
              <span className="block h-6 w-14 animate-pulse rounded bg-white/15 sm:h-7" />
              <span className="mt-1 block h-3 w-16 animate-pulse rounded bg-white/10" />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomepageContentLoading({ locale }: { locale: Locale }) {
  return (
    <section
      className="section-shell scroll-mt-24 pb-6 pt-6 sm:pb-8 sm:pt-8"
      aria-busy="true"
      aria-label={locale === "es" ? "Cargando decisiones" : "Loading decisions"}
    >
      <div className="mb-5 border-b border-black/10 pb-5">
        <div className="h-3 w-32 animate-pulse rounded bg-black/10" />
        <div className="mt-3 h-9 max-w-xl animate-pulse rounded bg-black/10" />
        <div className="mt-3 h-5 max-w-2xl animate-pulse rounded bg-black/[0.07]" />
      </div>
      <div className="grid gap-3">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="quiet-card h-28 animate-pulse bg-black/[0.035]" />
        ))}
      </div>
      <p className="sr-only">{locale === "es" ? "Cargando las decisiones más recientes…" : "Loading the latest decisions…"}</p>
    </section>
  );
}

async function HomepageDataContent({
  data,
  hasSearch,
  jurisdictionLabel,
  locale,
  search
}: {
  data: HomepageData;
  hasSearch: boolean;
  jurisdictionLabel: string;
  locale: Locale;
  search: string;
}) {
  const cardResult = await data.cardResultPromise;
  const cards = cardResult.cards;
  const availableCardCount = cardResult.totalCount;
  const filteredCards = hasSearch ? cards : cards.filter((card) => matchesSearch(card, search));
  const prioritizedCards = [...filteredCards].sort(compareCardsByPublicInterest);
  const publicInterestCards = prioritizedCards.filter(isPublicInterestCard);
  const decisionCards = selectDiverseCards(
    publicInterestCards.length > 0 ? publicInterestCards : prioritizedCards,
    4
  );
  const visibleCards = hasSearch ? prioritizedCards : decisionCards;
  const meetingPreviewCards = getMeetingPreviewCards(
    publicInterestCards.length > 0 ? publicInterestCards : prioritizedCards
  );
  const decisionSectionTitle = hasSearch
    ? locale === "es"
      ? `Resultados para "${search}"`
      : `Results for "${search}"`
    : locale === "es"
      ? "Decisiones que pueden afectar la vida diaria"
      : "Decisions that may affect daily life";
  const decisionSectionDescription = hasSearch
    ? locale === "es"
      ? "Decisiones coincidentes de la jurisdicción seleccionada, con elementos más recientes y de mayor impacto primero."
      : "Matching decisions from the currently selected jurisdiction, with newer, higher-impact items ranked first."
    : locale === "es"
      ? "Ordenado para mostrar primero decisiones próximas, luego elementos recientes de alto impacto como presupuestos, vivienda, seguridad, transporte, servicios, audiencias públicas, contratos y tarifas antes que elementos ceremoniales o de proceso interno."
      : "Ranked to surface upcoming decisions first, then recent high-impact items like budgets, housing, safety, transportation, services, public hearings, contracts, and fees ahead of ceremonial or internal process items.";

  return (
    <>
      <section id="decisions" className="section-shell scroll-mt-24 pb-6 pt-6 sm:pb-8 sm:pt-8">
        <div id="search-results" className="scroll-mt-24">
          <div className="mb-5 flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="label-eyebrow text-civic">
                {hasSearch ? t(locale, "searchResults") : t(locale, "topPublicDecisions")}
              </p>
              <h2 className="mt-2 text-3xl font-black leading-tight text-ink sm:text-4xl">
                {decisionSectionTitle}
              </h2>
              <p className="mt-2 text-base leading-7 text-black/[0.68]">{decisionSectionDescription}</p>
            </div>
            {hasSearch ? (
              <p className="count-badge">
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
        <div className="grid gap-3">
          {visibleCards.map((card) => (
            <SummaryCard key={card.id} card={card} locale={locale} expandOnOutcome={false} />
          ))}
          {filteredCards.length === 0 ? (
            <div className="quiet-card p-8 text-center">
              <h3 className="text-lg font-semibold text-ink">
                {hasSearch ? t(locale, "noMatchingDecisions") : t(locale, "noCardsYet")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-black/70">
                {hasSearch
                  ? t(locale, "trySearching")
                  : locale === "es"
                    ? `Cuando se ejecuten el recopilador y el resumidor, aparecerán aquí tarjetas oficiales de agenda de ${jurisdictionLabel}.`
                    : `Once the scraper and summarizer run, official ${jurisdictionLabel} agenda cards will appear here.`}
              </p>
            </div>
          ) : null}
        </div>
        {!hasSearch && availableCardCount > 4 ? (
          <Link href="/decisions" className="action-link mt-4 font-black underline-offset-4 hover:underline">
            {t(locale, "viewAllDecisions")}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : null}
      </section>

      {meetingPreviewCards.length > 0 ? (
        <section className="section-shell pb-8 pt-2">
          <div className="grid gap-5 border-y border-black/10 py-7 lg:grid-cols-[0.72fr_1fr] lg:items-start">
            <div>
              <p className="label-eyebrow text-civic">{t(locale, "upcomingMeetings")}</p>
              <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">
                {locale === "es" ? "Reuniones relacionadas con las decisiones principales" : "Meetings tied to the top decisions"}
              </h2>
              <p className="mt-3 max-w-md text-base leading-7 text-black/[0.68]">
                {locale === "es"
                  ? "Próximas reuniones conectadas con las tarjetas de mayor impacto que se muestran primero."
                  : "Upcoming meetings connected to the higher-impact cards shown first."}
              </p>
              <Link href="/meetings" className="action-link mt-4 font-black underline-offset-4 hover:underline">
                {t(locale, "viewAllMeetings")}
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </div>

            <div className="divide-y divide-black/10 overflow-hidden rounded-lg border border-black/10 bg-white">
              {meetingPreviewCards.map((card) => {
                const meeting = card.meetings;

                return (
                  <article
                    key={meeting.id}
                    className="grid gap-3 p-4 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="flex items-center gap-2 text-sm font-black text-[#12365f]">
                      <CalendarDays aria-hidden className="h-4 w-4" />
                      <span>{formatDisplayDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-base font-black leading-snug text-ink">
                        {displayMeetingTitle(
                          meeting,
                          locale === "es" ? "Reunión no indicada" : "Meeting not listed",
                          locale
                        )}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-black/[0.58]">
                        {displayMeetingType(meeting, t(locale, "meetingTypeNotListed"), locale)} ·{" "}
                        {meeting.jurisdiction_name || card.jurisdiction_name || jurisdictionLabel}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[#285f75]">
                        {t(locale, "connectedDecision")}: {publicAgendaTitle(card)}
                      </p>
                    </div>
                    <Link href={`/meetings/${meeting.id}`} className="action-secondary-sm">
                      {t(locale, "meetingDetails")}
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
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
  const topicCategories = isSchoolDistrictJurisdiction(jurisdiction)
    ? SCHOOL_CATEGORIES
    : CATEGORIES;
  const hasSearch = search.length > 0;
  const data = loadHomepageData({ jurisdiction, locale, search });
  const introLabel =
    jurisdiction === "all"
      ? locale === "es"
        ? "Reuniones públicas de varias jurisdicciones"
        : "Public meetings across jurisdictions"
      : locale === "es"
        ? `Reuniones públicas de ${jurisdictionLabel}`
        : `${jurisdictionLabel} public meetings`;

  return (
    <div className="overflow-hidden">
      <section className="civic-hero">
        <div
          className={`section-shell relative z-10 grid gap-7 ${
            hasSearch ? "py-7 sm:py-8" : "py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-end lg:py-14"
          }`}
        >
          <div className="max-w-2xl">
            {!hasSearch ? (
              <a
                href={FEATURE_ARTICLE_URL}
                target="_blank"
                rel="noreferrer"
                className="group mb-6 inline-flex max-w-full items-center gap-2 rounded-sm text-sm font-semibold text-[#d9e2ec] underline decoration-white/25 underline-offset-4 transition hover:text-white hover:decoration-white/60 focus-visible:focus-ring"
              >
                <span>
                  {locale === "es"
                    ? "Lee sobre SimpleCity en Los Altos Town Crier"
                    : "Read about SimpleCity in the Los Altos Town Crier"}
                </span>
                <ArrowRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-[#9fc4f4] transition-transform group-hover:translate-x-0.5"
                />
              </a>
            ) : null}
            <p className="text-sm font-black uppercase text-[#9fc4f4]">
              {introLabel}
            </p>
            <h1 className="mt-4 text-balance text-[36px] font-black leading-[1.02] text-[#fffaf0] sm:text-[52px] lg:text-[56px]">
              {locale === "es"
                ? "Mira qué está decidiendo tu gobierno local."
                : "See what your local government is deciding."}
            </h1>
            <p className="mt-4 max-w-2xl text-balance text-base font-medium leading-7 text-[#d9e2ec] sm:mt-5 sm:text-xl sm:leading-8">
              {locale === "es"
                ? "Lee resúmenes en lenguaje claro, revisa próximas reuniones y votaciones, y encuentra formas de compartir tu opinión."
                : "Get easy-to-understand, source-linked summaries, check upcoming meetings and votes, and find ways to share your input."}
            </p>
            <Suspense
              fallback={<div className="mt-5 h-5 w-64 animate-pulse rounded bg-white/10" aria-hidden />}
            >
              <HeroStatus data={data} locale={locale} />
            </Suspense>
          </div>

          <div className="space-y-5 lg:justify-self-stretch">
            {!hasSearch ? (
              <Suspense fallback={<GlanceStatsLoading locale={locale} />}>
                <GlanceStats locale={locale} />
              </Suspense>
            ) : null}

            <div>
              <p className="mb-4 text-xs font-black uppercase tracking-wide text-[#9fc4f4]">
                {locale === "es" ? "Buscar resúmenes oficiales" : "Search official summaries"}
              </p>
              <SearchAndFilters
                action={`/decisions?jurisdiction=${toPublicJurisdictionSlug(jurisdiction)}`}
                search={search}
                locale={locale}
              />
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={<HomepageContentLoading locale={locale} />}>
        <HomepageDataContent
          data={data}
          hasSearch={hasSearch}
          jurisdictionLabel={jurisdictionLabel}
          locale={locale}
          search={search}
        />
      </Suspense>
      <section className="section-shell pb-16 pt-8">
        <div className="mb-5 max-w-2xl">
          <p className="label-eyebrow text-civic">{t(locale, "browseByTopic")}</p>
          <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">{t(locale, "everydayImpactTitle")}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topicCategories.map((category) => {
            const definition = CATEGORY_DEFINITIONS[category];
            const Icon = definition.icon;
            return (
              <Link
                key={category}
                href={`/topics/${definition.slug}?${new URLSearchParams({
                  jurisdiction: toPublicJurisdictionSlug(jurisdiction),
                  ...(params.lang ? { lang: params.lang } : {})
                }).toString()}`}
                className="quiet-card topic-card group grid min-h-[88px] grid-cols-[2.75rem_1fr] items-center gap-3 px-4 py-4 focus-visible:focus-ring"
              >
                <span className="icon-tile transition-colors duration-150 group-hover:bg-[#e6f0ff] group-hover:text-civic">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="text-base font-black leading-5 text-ink">
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
