"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { preload } from "react-dom";
import { SummaryCard } from "@/components/SummaryCard";
import {
  getJurisdictionDisplayLabel,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { SummaryCardRow } from "@/lib/types";
import {
  publicAgendaTitle
} from "@/lib/utils/civicPriority";
import {
  formatDisplayDate,
} from "@/lib/utils/date";
import { displayMeetingTitle, displayMeetingType } from "@/lib/utils/meetingDisplay";
import { normalizeSummaryPoints } from "@/lib/utils/summaryPoints";

type HomepagePayload = {
  cardResult: {
    cards: SummaryCardRow[];
    meetingCards: SummaryCardRow[];
    totalCount: number;
  };
};

type HomepageDataState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: HomepagePayload }
  | { status: "error"; data: null };

const HomepageDataContext = createContext<HomepageDataState>({ status: "loading", data: null });
const memoryCache = new Map<string, HomepagePayload>();
const pendingRequests = new Map<string, Promise<HomepagePayload>>();

function dataUrl(jurisdiction: JurisdictionSelection, locale: Locale, search: string) {
  // Cloudflare does not cache JSON URLs by default. The .js pathname makes this
  // public JSON response cache-eligible; its Content-Type remains JSON.
  const path = `/homepage-data/${encodeURIComponent(jurisdiction)}/${locale}/data.js`;
  const params = new URLSearchParams({ v: "3" });
  if (search) params.set("q", search);
  return `${path}?${params.toString()}`;
}

function requestHomepageData(url: string) {
  const cached = memoryCache.get(url);
  if (cached) return Promise.resolve(cached);

  const pending = pendingRequests.get(url);
  if (pending) return pending;

  const request = fetch(url, { headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Homepage data request failed (${response.status})`);
      const payload = (await response.json()) as HomepagePayload;
      memoryCache.set(url, payload);
      return payload;
    })
    .finally(() => pendingRequests.delete(url));

  pendingRequests.set(url, request);
  return request;
}

export function HomepageDataProvider({
  children,
  jurisdiction,
  locale,
  search
}: {
  children: React.ReactNode;
  jurisdiction: JurisdictionSelection;
  locale: Locale;
  search: string;
}) {
  const url = useMemo(() => dataUrl(jurisdiction, locale, search), [jurisdiction, locale, search]);
  preload(url, { as: "fetch", crossOrigin: "anonymous", fetchPriority: "high" });
  const [result, setResult] = useState<{ url: string; state: HomepageDataState }>(() => {
    const cached = memoryCache.get(url);
    return {
      url,
      state: cached ? { status: "ready", data: cached } : { status: "loading", data: null }
    };
  });
  const cached = memoryCache.get(url);
  const state: HomepageDataState =
    result.url === url
      ? result.state
      : cached
        ? { status: "ready", data: cached }
        : { status: "loading", data: null };

  useEffect(() => {
    let current = true;

    requestHomepageData(url).then(
      (data) => current && setResult({ url, state: { status: "ready", data } }),
      () => current && setResult({ url, state: { status: "error", data: null } })
    );

    return () => {
      current = false;
    };
  }, [url]);

  return <HomepageDataContext.Provider value={state}>{children}</HomepageDataContext.Provider>;
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export function HomepageHeroStatus({ locale }: { locale: Locale }) {
  const state = useContext(HomepageDataContext);
  if (state.status !== "ready") {
    return <div className="mt-5 h-5 w-64 animate-pulse rounded bg-white/10" aria-hidden />;
  }

  const { cardResult } = state.data;
  const summarySentence = locale === "es"
    ? `${pluralize(cardResult.totalCount, "decisión publicada", "decisiones publicadas")} disponibles`
    : `${pluralize(cardResult.totalCount, "published decision", "published decisions")} available`;

  return <p className="mt-5 text-sm font-semibold text-[#aebdcc]">{summarySentence}</p>;
}

function matchesSearch(card: SummaryCardRow, search: string) {
  if (!search) return true;
  return [
    card.agenda_item,
    ...normalizeSummaryPoints(card.what_is_happening),
    card.why_it_matters,
    card.meetings?.title,
    ...(card.category_tags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(search.toLowerCase());
}

export function HomepageContentLoading({ locale }: { locale: Locale }) {
  return (
    <section className="section-shell scroll-mt-24 pb-6 pt-6 sm:pb-8 sm:pt-8" aria-busy="true" aria-label={locale === "es" ? "Cargando decisiones" : "Loading decisions"}>
      <div className="mb-5 border-b border-black/10 pb-5">
        <div className="h-3 w-32 animate-pulse rounded bg-black/10" />
        <div className="mt-3 h-9 max-w-xl animate-pulse rounded bg-black/10" />
        <div className="mt-3 h-5 max-w-2xl animate-pulse rounded bg-black/[0.07]" />
      </div>
      <div className="grid gap-3">{[0, 1, 2, 3].map((item) => <div key={item} className="quiet-card h-28 animate-pulse bg-black/[0.035]" />)}</div>
      <p className="sr-only">{locale === "es" ? "Cargando las decisiones más recientes…" : "Loading the latest decisions…"}</p>
    </section>
  );
}

export function HomepageDataContent({
  hasSearch,
  jurisdictionLabel,
  locale,
  search
}: {
  hasSearch: boolean;
  jurisdictionLabel: string;
  locale: Locale;
  search: string;
}) {
  const state = useContext(HomepageDataContext);
  if (state.status !== "ready") return <HomepageContentLoading locale={locale} />;

  const { cards, meetingCards, totalCount: availableCardCount } = state.data.cardResult;
  const filteredCards = hasSearch ? cards : cards.filter((card) => matchesSearch(card, search));
  const visibleCards = filteredCards;
  const meetingPreviewCards = meetingCards.filter(
    (card): card is SummaryCardRow & { meetings: NonNullable<SummaryCardRow["meetings"]> } => Boolean(card.meetings)
  );
  const decisionSectionTitle = hasSearch
    ? locale === "es" ? `Resultados para "${search}"` : `Results for "${search}"`
    : locale === "es" ? "Decisiones que pueden afectar la vida diaria" : "Decisions that may affect daily life";
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
              <p className="label-eyebrow text-civic">{hasSearch ? t(locale, "searchResults") : t(locale, "topPublicDecisions")}</p>
              <h2 className="mt-2 text-3xl font-black leading-tight text-ink sm:text-4xl">{decisionSectionTitle}</h2>
              <p className="mt-2 text-base leading-7 text-black/[0.68]">{decisionSectionDescription}</p>
            </div>
            {hasSearch ? <p className="count-badge">{filteredCards.length === 1 ? (locale === "es" ? "1 decisión coincidente" : "1 matching decision") : (locale === "es" ? `${filteredCards.length} decisiones coincidentes` : `${filteredCards.length} matching decisions`)}</p> : null}
          </div>
        </div>
        <div className="grid gap-3">
          {visibleCards.map((card) => <SummaryCard key={card.id} card={card} locale={locale} expandOnOutcome={false} />)}
          {filteredCards.length === 0 ? (
            <div className="quiet-card p-8 text-center">
              <h3 className="text-lg font-semibold text-ink">{hasSearch ? t(locale, "noMatchingDecisions") : t(locale, "noCardsYet")}</h3>
              <p className="mt-2 text-sm leading-6 text-black/70">{hasSearch ? t(locale, "trySearching") : locale === "es" ? `Cuando se ejecuten el recopilador y el resumidor, aparecerán aquí tarjetas oficiales de agenda de ${jurisdictionLabel}.` : `Once the scraper and summarizer run, official ${jurisdictionLabel} agenda cards will appear here.`}</p>
            </div>
          ) : null}
        </div>
        {!hasSearch && availableCardCount > 4 ? <Link href="/decisions" className="action-link mt-4 font-black underline-offset-4 hover:underline">{t(locale, "viewAllDecisions")}<ArrowRight aria-hidden className="h-4 w-4" /></Link> : null}
      </section>

      {meetingPreviewCards.length > 0 ? (
        <section className="section-shell pb-8 pt-2">
          <div className="grid gap-5 border-y border-black/10 py-7 lg:grid-cols-[0.72fr_1fr] lg:items-start">
            <div>
              <p className="label-eyebrow text-civic">{t(locale, "upcomingMeetings")}</p>
              <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">{locale === "es" ? "Reuniones relacionadas con las decisiones principales" : "Meetings tied to the top decisions"}</h2>
              <p className="mt-3 max-w-md text-base leading-7 text-black/[0.68]">{locale === "es" ? "Próximas reuniones conectadas con las tarjetas de mayor impacto que se muestran primero." : "Upcoming meetings connected to the higher-impact cards shown first."}</p>
              <Link href="/meetings" className="action-link mt-4 font-black underline-offset-4 hover:underline">{t(locale, "viewAllMeetings")}<ArrowRight aria-hidden className="h-4 w-4" /></Link>
            </div>
            <div className="divide-y divide-black/10 overflow-hidden rounded-lg border border-black/10 bg-white">
              {meetingPreviewCards.map((card) => {
                const meeting = card.meetings;
                return (
                  <article key={meeting.id} className="grid gap-3 p-4 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center">
                    <div className="flex items-center gap-2 text-sm font-black text-[#12365f]"><CalendarDays aria-hidden className="h-4 w-4" /><span>{formatDisplayDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text, locale)}</span></div>
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-base font-black leading-snug text-ink">{displayMeetingTitle(meeting, locale === "es" ? "Reunión no indicada" : "Meeting not listed", locale)}</h3>
                      <p className="mt-1 text-sm font-semibold text-black/[0.58]">{displayMeetingType(meeting, t(locale, "meetingTypeNotListed"), locale)} · {meeting.jurisdiction_slug || card.jurisdiction_slug ? getJurisdictionDisplayLabel(meeting.jurisdiction_slug || card.jurisdiction_slug, locale) : meeting.jurisdiction_name || card.jurisdiction_name || jurisdictionLabel}</p>
                      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[#285f75]">{t(locale, "connectedDecision")}: {publicAgendaTitle(card)}</p>
                    </div>
                    <Link href={`/meetings/${meeting.id}`} className="action-secondary-sm">{t(locale, "meetingDetails")}</Link>
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
