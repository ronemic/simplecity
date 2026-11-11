import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { SummaryCard } from "@/components/SummaryCard";
import { getJurisdictionDisplayLabel } from "@/lib/config/jurisdictions";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { HomepageCardSelection } from "@/lib/db/queries";
import type { MeetingRow, SummaryCardRow } from "@/lib/types";
import { DECISION_SORTS, type DecisionSort } from "@/lib/utils/decisionFilters";
import { cn } from "@/lib/utils/cn";
import { publicAgendaTitle } from "@/lib/utils/civicPriority";
import { cardSharePath } from "@/lib/utils/cardShare";
import {
  civicCalendarDay,
  hasDisplayableMeetingTime,
  isUpcomingMeetingDate,
  meetingClockTime
} from "@/lib/utils/date";
import { displayMeetingTitle } from "@/lib/utils/meetingDisplay";

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export function HomepageHeroStatus({
  locale,
  totalCount
}: {
  locale: Locale;
  totalCount: number;
}) {
  const summarySentence =
    locale === "es"
      ? `${pluralize(totalCount, "decisión publicada", "decisiones publicadas")} disponibles`
      : `${pluralize(totalCount, "published decision", "published decisions")} available`;

  return <p className="mt-5 text-sm font-semibold text-[#aebdcc]">{summarySentence}</p>;
}

/** Holds the status line's height while the count streams in. */
export function HomepageHeroStatusLoading() {
  return <div className="mt-5 h-5 w-64 animate-pulse rounded bg-white/10" aria-hidden />;
}

export function HomepageContentLoading({ locale }: { locale: Locale }) {
  return (
    <section
      className="section-shell grid scroll-mt-24 gap-10 pb-8 pt-8 sm:pt-10 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]"
      aria-busy="true"
      aria-label={locale === "es" ? "Cargando decisiones" : "Loading decisions"}
    >
      <div>
        <div className="mb-4 h-7 w-56 animate-pulse rounded bg-black/10" />
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="quiet-card h-28 animate-pulse bg-black/[0.035]" />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-4 h-7 w-40 animate-pulse rounded bg-black/10" />
        <div className="grid gap-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded bg-black/[0.035]" />
          ))}
        </div>
      </div>
      <p className="sr-only">
        {locale === "es" ? "Cargando las decisiones más recientes…" : "Loading the latest decisions…"}
      </p>
    </section>
  );
}

/**
 * Shown when the decisions query fails outright.
 *
 * Rendering the cards on the server means an unhandled read error would take
 * the whole homepage to the error boundary, where the client fetch used to
 * degrade just this one section. The hero, topics, and footer are still useful
 * without decisions, so the failure stays boxed in here.
 */
export function HomepageContentUnavailable({ locale }: { locale: Locale }) {
  return (
    <section className="section-shell scroll-mt-24 pb-6 pt-6 sm:pb-8 sm:pt-8">
      <div className="quiet-card p-8 text-center">
        <h2 className="text-lg font-semibold text-ink">
          {locale === "es" ? "No se pudieron cargar las decisiones" : "Decisions could not be loaded"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-black/70">
          {locale === "es"
            ? "Vuelve a cargar la página para intentarlo de nuevo, o consulta la lista completa de decisiones."
            : "Reload the page to try again, or browse the full list of decisions."}
        </p>
        <Link href="/decisions" className="action-link mt-4 font-black underline-offset-4 hover:underline">
          {t(locale, "viewAllDecisions")}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

const HOMEPAGE_SIDEBAR_MEETING_COUNT = 6;

export type HomepageSort = DecisionSort;

export function homepageSortFromParam(value?: string | null): HomepageSort {
  return value === "newest" ? "newest" : "upcoming";
}

function meetingSortKey(meeting: MeetingRow) {
  return meeting.meeting_datetime || civicCalendarDay(meeting.date_text) || "";
}

/** Every non-cancelled meeting, latest meeting date first (decisions-tab order). */
export function newestHomepageMeetings(meetings: MeetingRow[]) {
  return meetings
    .filter((meeting) => meeting.status !== "Cancelled")
    .sort((left, right) => {
      const leftKey = meetingSortKey(left);
      const rightKey = meetingSortKey(right);
      if (!leftKey || !rightKey) return Number(!leftKey) - Number(!rightKey);
      return rightKey.localeCompare(leftKey);
    });
}

/** Upcoming, non-cancelled meetings, soonest first. */
export function upcomingHomepageMeetings(meetings: MeetingRow[]) {
  const sortKey = (meeting: MeetingRow) => meetingSortKey(meeting) || "\uffff";
  return meetings
    .filter(
      (meeting) =>
        meeting.status !== "Cancelled" &&
        isUpcomingMeetingDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)
    )
    .sort((left, right) => sortKey(left).localeCompare(sortKey(right)));
}

function meetingDayHeading(day: string, locale: Locale) {
  if (!day) return locale === "es" ? "Fecha no indicada" : "Date not listed";
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${day}T12:00:00Z`));
}

export function MeetingsCalendarSidebar({
  cards,
  locale,
  meetings,
  sort = "upcoming",
  variant = "page",
  className,
  headerClassName,
  bodyClassName
}: {
  cards: SummaryCardRow[];
  locale: Locale;
  meetings: MeetingRow[] | null;
  sort?: HomepageSort;
  /** "page" pairs with a page-section heading; "compact" with a list toolbar. */
  variant?: "page" | "compact";
  className?: string;
  /**
   * Header and body are separate boxes so a parent grid can put each in the
   * same row as the column beside it (pass `lg:contents` as className), which
   * keeps both columns' divider lines and first items level.
   */
  headerClassName?: string;
  bodyClassName?: string;
}) {
  const shown = (meetings || []).slice(0, HOMEPAGE_SIDEBAR_MEETING_COUNT);
  const days = new Map<string, MeetingRow[]>();
  for (const meeting of shown) {
    const day = civicCalendarDay(meeting.date_text, meeting.meeting_datetime) || "";
    days.set(day, [...(days.get(day) || []), meeting]);
  }
  const sortNote = sort === "newest"
    ? locale === "es" ? "Fechas más recientes primero." : "Latest meeting dates first."
    : locale === "es" ? "Próximas reuniones, la más cercana primero." : "Upcoming meetings, soonest first.";
  const cardByMeeting = new Map<string, SummaryCardRow>();
  for (const card of cards) {
    const meetingId = card.meeting_id || card.meetings?.id;
    if (meetingId && !cardByMeeting.has(meetingId)) cardByMeeting.set(meetingId, card);
  }

  return (
    <aside aria-labelledby="home-meetings-heading" className={cn("min-w-0", className)}>
      {variant === "compact" ? (
        <div className={cn("border-b border-black/10 py-2.5 sm:py-3", headerClassName)}>
          <h2 id="home-meetings-heading" className="text-base font-black text-ink sm:text-lg">
            {locale === "es" ? "Calendario de reuniones" : "Meeting calendar"}
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-black/50">{sortNote}</p>
        </div>
      ) : (
        <div className={cn("mb-5 border-b border-black/10 pb-5", headerClassName)}>
          <p className="label-eyebrow text-civic">
            {sort === "newest" ? t(locale, "meetings") : t(locale, "upcomingMeetings")}
          </p>
          <h2 id="home-meetings-heading" className="mt-2 text-3xl font-black leading-tight text-ink sm:text-4xl">
            {locale === "es" ? "Calendario de reuniones" : "Meeting calendar"}
          </h2>
          <p className="mt-2 text-base leading-7 text-black/[0.68]">{sortNote}</p>
        </div>
      )}
      <div className={cn("min-w-0", bodyClassName)}>
      {meetings === null ? (
        <p className="quiet-card p-5 text-sm text-black/70">
          {locale === "es" ? "No se pudieron cargar las reuniones." : "Meetings could not be loaded."}
        </p>
      ) : days.size === 0 ? (
        <p className="quiet-card p-5 text-sm text-black/70">
          {sort === "newest"
            ? locale === "es" ? "No hay reuniones para mostrar." : "No meetings to show."
            : locale === "es" ? "No hay próximas reuniones programadas." : "No upcoming meetings scheduled."}
        </p>
      ) : (
        [...days].map(([day, group]) => (
          <section
            key={day || "undated"}
            className="mb-3 overflow-hidden rounded-lg border border-black/10 bg-white"
          >
            <h3 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-black/10 bg-black/[0.02] px-4 py-2.5 text-sm font-black text-[#12365f]">
              <CalendarDays aria-hidden className="h-4 w-4 shrink-0" />
              {meetingDayHeading(day, locale)}
              <span className="whitespace-nowrap font-semibold text-black/[0.5]">
                {" · "}
                {group.length}{" "}
                {locale === "es"
                  ? group.length === 1 ? "reunión" : "reuniones"
                  : group.length === 1 ? "meeting" : "meetings"}
              </span>
            </h3>
            <ul className="divide-y divide-black/10">
              {group.map((meeting) => {
                const card = cardByMeeting.get(meeting.id);
                const time = hasDisplayableMeetingTime(
                  meeting.date_text,
                  meeting.meeting_datetime,
                  meeting.time_text
                )
                  ? meetingClockTime(meeting.meeting_datetime, locale) || meeting.time_text
                  : null;
                return (
                  <li
                    key={meeting.id}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 px-4 py-3.5"
                  >
                    <span className="text-sm font-black text-[#12365f]">{time || "—"}</span>
                    <div className="min-w-0">
                      <Link
                        href={`/meetings/${encodeURIComponent(meeting.id)}`}
                        className="text-base font-black leading-snug text-ink underline-offset-4 hover:underline focus-visible:focus-ring"
                      >
                        {displayMeetingTitle(
                          meeting,
                          locale === "es" ? "Reunión no indicada" : "Meeting not listed",
                          locale
                        )}
                      </Link>
                      <p className="mt-1 text-sm font-semibold text-black/[0.58]">
                        {meeting.jurisdiction_slug
                          ? getJurisdictionDisplayLabel(meeting.jurisdiction_slug, locale)
                          : meeting.jurisdiction_name}
                      </p>
                      {card ? (
                        <Link
                          href={cardSharePath(card.id)}
                          className="mt-2 line-clamp-2 block text-sm font-semibold leading-5 text-[#285f75] underline-offset-4 hover:underline"
                        >
                            {t(locale, "connectedDecision")}: {publicAgendaTitle(card)}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <Link href="/meetings" className="action-link mt-2 font-black underline-offset-4 hover:underline">
        {t(locale, "viewAllMeetings")}
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
      </div>
    </aside>
  );
}

export function HomepageDataContent({
  content,
  hasSearch,
  jurisdictionLabel,
  locale,
  meetings,
  search,
  sort,
  sortLinkParams
}: {
  content: HomepageCardSelection;
  hasSearch: boolean;
  jurisdictionLabel: string;
  locale: Locale;
  meetings: MeetingRow[] | null;
  search: string;
  sort: HomepageSort;
  /** Query params kept when switching sort (search, area, language). */
  sortLinkParams: Record<string, string>;
}) {
  const { cards, meetingCards, totalCount: availableCardCount } = content;
  const decisionSectionTitle = hasSearch
    ? locale === "es"
      ? `Resultados para "${search}"`
      : `Results for "${search}"`
    : locale === "es"
      ? "Decisiones que pueden afectar la vida diaria"
      : "Decisions that may affect daily life";
  const decisionSectionDescription = sort === "newest"
    ? locale === "es"
      ? "Las fechas de reunión más recientes primero, igual que en la pestaña de decisiones."
      : "Latest meeting dates first, the same order as the decisions tab."
    : hasSearch
    ? locale === "es"
      ? "Decisiones coincidentes de la jurisdicción seleccionada, con elementos más recientes y de mayor impacto primero."
      : "Matching decisions from the currently selected jurisdiction, with newer, higher-impact items ranked first."
    : locale === "es"
      ? "Primero las próximas votaciones, de la más cercana a la más lejana, y luego las decisiones más recientes."
      : "Upcoming votes first, soonest first, followed by the most recent decisions.";

  return (
    <section
      id="decisions"
      className="section-shell grid scroll-mt-24 gap-x-10 pb-8 pt-8 sm:pt-10 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]"
    >
      <nav
        aria-label={locale === "es" ? "Ordenar decisiones y reuniones" : "Sort decisions and meetings"}
        className="mb-6 flex flex-wrap items-center gap-2.5 lg:col-span-2"
      >
        <span className="text-sm font-bold text-ink">{locale === "es" ? "Ordenar:" : "Sort:"}</span>
        {DECISION_SORTS.map((option) => {
          const params = new URLSearchParams(sortLinkParams);
          if (option !== "upcoming") params.set("sort", option);
          const query = params.toString();
          return (
            <Link
              key={option}
              href={`/${query ? `?${query}` : ""}#decisions`}
              scroll={false}
              aria-current={sort === option ? "true" : undefined}
              className={`chip chip-action ${sort === option ? "chip-selected" : ""}`}
            >
              {option === "newest"
                ? locale === "es" ? "Más recientes primero" : "Newest first"
                : locale === "es" ? "Próximas primero" : "Upcoming first"}
            </Link>
          );
        })}
      </nav>
      {/* Row 2 holds both column headings, bottom-aligned so their divider
          lines meet; row 3 starts the cards and the meeting list together. */}
      <div
        id="search-results"
        className="mb-5 flex min-w-0 scroll-mt-24 flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between lg:col-start-1 lg:row-start-2 lg:self-end"
      >
          <div className="max-w-2xl">
            <p className="label-eyebrow text-civic">
              {hasSearch ? t(locale, "searchResults") : t(locale, "topPublicDecisions")}
            </p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-ink sm:text-4xl">{decisionSectionTitle}</h2>
            <p className="mt-2 text-base leading-7 text-black/[0.68]">{decisionSectionDescription}</p>
          </div>
          {hasSearch ? (
            <p className="count-badge">
              {availableCardCount === 1
                ? locale === "es"
                  ? "1 decisión coincidente"
                  : "1 matching decision"
                : locale === "es"
                  ? `${availableCardCount} decisiones coincidentes`
                  : `${availableCardCount} matching decisions`}
            </p>
          ) : null}
      </div>
      <div className="min-w-0 lg:col-start-1 lg:row-start-3">
        <div className="grid gap-3">
          {cards.map((card) => (
            <SummaryCard key={card.id} card={card} locale={locale} expandOnOutcome={false} />
          ))}
          {cards.length === 0 ? (
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
        {!hasSearch && availableCardCount > cards.length ? (
          <Link href="/decisions" className="action-link mt-4 font-black underline-offset-4 hover:underline">
            {t(locale, "viewAllDecisions")}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      <MeetingsCalendarSidebar
        cards={meetingCards}
        locale={locale}
        meetings={meetings}
        sort={sort}
        className="mt-10 lg:contents"
        headerClassName="lg:col-start-2 lg:row-start-2 lg:self-end"
        bodyClassName="lg:col-start-2 lg:row-start-3"
      />
    </section>
  );
}
