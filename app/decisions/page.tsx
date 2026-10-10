import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Vote } from "lucide-react";
import { DecisionBrowser } from "@/components/DecisionBrowser";
import { DecisionResultSelect } from "@/components/DecisionResultSelect";
import {
  getDecisionCardPage,
  getDecisionResultFreshness,
  type DecisionResultFreshness
} from "@/lib/db/queries";
import { cookies } from "next/headers";
import {
  ALL_JURISDICTIONS_SLUG,
  JURISDICTION_PREFERENCE_COOKIE,
  getPublicJurisdictionOptions,
  getJurisdictionDisplayLabel,
  getJurisdictionLabel,
  normalizeJurisdictionSelection,
  toInternalJurisdictionSlug,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { categoryFromSlug } from "@/lib/utils/decisionFilters";
import { decisionResultFilterFromSlug } from "@/lib/utils/decisionResultFilter";
import { t } from "@/lib/i18n";
import { getPageLocale, getRequestLocale } from "@/lib/i18n/server";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";
import { CATEGORIES, DECISION_CARD_PAGE_SIZE, MAX_DECISION_CARD_PAGE, SCHOOL_CATEGORIES } from "@/lib/constants";
import { normalizeSantaBarbaraBodyView } from "@/lib/utils/santaBarbaraBody";
import { PendingLink } from "@/components/PendingLink";
import { ResultsFreshnessMenu } from "@/components/ResultsFreshnessMenu";
import { isElectionPromoActive } from "@/lib/elections/california2026";

export const revalidate = 300;

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ q?: string; category?: string; result?: string; body?: string; jurisdiction?: string; page?: string; lang?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const locale = await getPageLocale(params.lang);
  const jurisdiction = params.jurisdiction
    ? normalizeJurisdictionSelection(params.jurisdiction)
    : ALL_JURISDICTIONS_SLUG;
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction, locale);
  const label = jurisdiction === ALL_JURISDICTIONS_SLUG ? "Local government" : jurisdictionLabel;
  const title =
    locale === "es"
      ? `${jurisdiction === ALL_JURISDICTIONS_SLUG ? "Decisiones del gobierno local" : `Decisiones de ${jurisdictionLabel}`} | SimpleCity`
      : `${label} decisions | SimpleCity`;
  const description =
    locale === "es"
      ? `Sigue decisiones de ${jurisdiction === ALL_JURISDICTIONS_SLUG ? "gobiernos locales" : jurisdictionLabel}, próximas votaciones, reuniones públicas, resultados y formas de participar.`
      : `Track ${label.toLowerCase()} decisions, upcoming votes, public meetings, outcomes, and ways residents can participate.`;
  const canonicalUrl = new URL("/decisions", "https://simplecity.invalid");
  if (params.jurisdiction) {
    canonicalUrl.searchParams.set("jurisdiction", toPublicJurisdictionSlug(jurisdiction));
  }
  const urls = localizedSeoUrls(`${canonicalUrl.pathname}${canonicalUrl.search}`, seoLocale(params.lang));
  const isFiltered = Boolean(params.q || params.category || params.result || params.body || params.page);

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages },
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: { title, description, type: "website", url: urls.canonical, siteName: "SimpleCity" },
    twitter: { card: "summary", title, description }
  };
}

function decisionsTitle(locale: "en" | "es", jurisdiction: string, jurisdictionLabel: string) {
  if (jurisdiction === ALL_JURISDICTIONS_SLUG) {
    return locale === "es" ? "Todas las decisiones" : "All decisions";
  }

  return locale === "es" ? `Decisiones de ${jurisdictionLabel}` : `${jurisdictionLabel} decisions`;
}

function noCardsDescription(locale: "en" | "es", jurisdiction: string, jurisdictionLabel: string) {
  if (jurisdiction === ALL_JURISDICTIONS_SLUG) {
    return locale === "es"
      ? "Las tarjetas oficiales de agenda aparecerán aquí cuando se recopilen las reuniones."
      : "Official agenda cards will appear here once meetings are collected.";
  }

  return locale === "es"
    ? `Las tarjetas oficiales de agenda de ${jurisdictionLabel} aparecerán aquí cuando se recopilen las reuniones.`
    : `Official ${jurisdictionLabel} agenda cards will appear here once meetings are collected.`;
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value || "", 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_DECISION_CARD_PAGE);
}

function santaBarbaraBodyHref(
  params: {
    q?: string;
    category?: string;
    result?: string;
    body?: string;
    jurisdiction?: string;
    page?: string;
    lang?: string;
  },
  body: "all" | "board" | "planning"
) {
  const nextParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) nextParams.set(key, value);
  }
  nextParams.set("body", body);
  nextParams.delete("page");
  if (body === "planning") nextParams.delete("result");
  return `/decisions?${nextParams.toString()}`;
}

function freshnessDate(freshness: DecisionResultFreshness, slug: string) {
  const internalSlug = toInternalJurisdictionSlug(slug);
  if (!internalSlug || !Object.prototype.hasOwnProperty.call(freshness, internalSlug)) {
    return { status: "unavailable" as const };
  }
  const value = freshness[internalSlug as keyof DecisionResultFreshness];
  if (!value) return { status: "none" as const };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { status: "unavailable" as const };
  return { status: "dated" as const, date: parsed };
}

function formatFreshnessDate(date: Date, locale: "en" | "es", withYear = true) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {})
  }).format(date);
}

function freshnessLabel(
  freshness: DecisionResultFreshness,
  slug: string,
  locale: "en" | "es",
  advisory = false
) {
  const entry = freshnessDate(freshness, slug);
  if (entry.status === "unavailable") {
    return locale === "es" ? "Fecha no disponible" : "Date unavailable";
  }
  if (entry.status === "none") {
    return advisory
      ? locale === "es" ? "Aún no hay recomendaciones" : "No recommendations yet"
      : locale === "es" ? "Aún no hay resultados" : "No results yet";
  }

  const formattedDate = formatFreshnessDate(entry.date, locale);
  return advisory
    ? locale === "es"
      ? `Recomendaciones hasta el ${formattedDate}`
      : `Recommendations through ${formattedDate}`
    : locale === "es"
      ? `Resultados hasta el ${formattedDate}`
      : `Results through ${formattedDate}`;
}

function allJurisdictionsFreshness(freshness: DecisionResultFreshness, locale: "en" | "es") {
  const currentYear = new Date().getFullYear();
  const entries = getPublicJurisdictionOptions()
    .filter((option) => option.slug !== ALL_JURISDICTIONS_SLUG)
    .map((option) => ({
      slug: option.slug,
      label: getJurisdictionDisplayLabel(option.slug, locale),
      ...freshnessDate(freshness, option.slug)
    }))
    // Most recently updated first, then places without results.
    .sort((a, b) => {
      const aTime = a.status === "dated" ? a.date.getTime() : -Infinity;
      const bTime = b.status === "dated" ? b.date.getTime() : -Infinity;
      return bTime - aTime || a.label.localeCompare(b.label);
    });
  const latest = entries[0]?.status === "dated" ? entries[0].date : null;
  const summary = latest
    ? locale === "es"
      ? `Resultados hasta el ${formatFreshnessDate(latest, locale)}`
      : `Results through ${formatFreshnessDate(latest, locale)}`
    : locale === "es" ? "Aún no hay resultados" : "No results yet";

  return {
    summary,
    entries: entries.map((entry) => ({
      slug: entry.slug,
      label: entry.label,
      date:
        entry.status === "dated"
          ? formatFreshnessDate(entry.date, locale, entry.date.getFullYear() !== currentYear)
          : null
    }))
  };
}

export default async function DecisionsPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    result?: string;
    body?: string;
    jurisdiction?: string;
    page?: string;
    lang?: string;
    view?: string;
  }>;
}) {
  const [params, locale, cookieStore] = await Promise.all([
    searchParams,
    getRequestLocale(),
    cookies()
  ]);
  const jurisdiction = normalizeJurisdictionSelection(
    params.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction, locale);
  const isAllJurisdictions = jurisdiction === ALL_JURISDICTIONS_SLUG;
  const isSchoolDistrict = jurisdiction === "los-altos-school-district";
  const isSantaBarbara = jurisdiction === "santa-barbara-county";
  const santaBarbaraBody = normalizeSantaBarbaraBodyView(params.body);
  const topicCategories = isSchoolDistrict ? SCHOOL_CATEGORIES : CATEGORIES;
  const search = (params.q || "").trim();
  const selectedCategory = categoryFromSlug(params.category, topicCategories);
  const selectedResult =
    isSantaBarbara && santaBarbaraBody === "planning"
      ? undefined
      : decisionResultFilterFromSlug(params.result);
  const currentPage = parsePage(params.page);
  const [result, decisionResultFreshness] = await Promise.all([
    params.view === "map" ? Promise.resolve({
      cards: [], page: currentPage, pageCount: 0, pageSize: DECISION_CARD_PAGE_SIZE, totalCount: 0
    }) : getDecisionCardPage({
      jurisdiction,
      locale,
      search,
      category: selectedCategory,
      result: selectedResult,
      body:
        isSantaBarbara && santaBarbaraBody !== "all"
          ? santaBarbaraBody
          : undefined,
      page: currentPage
    }),
    getDecisionResultFreshness(
      isSantaBarbara && santaBarbaraBody !== "all" ? santaBarbaraBody : "",
      jurisdiction
    )
  ]);

  return (
    <div className="section-shell py-5 sm:py-8">
      <div className="mb-3 max-w-4xl sm:mb-5">
        <p className="label-eyebrow text-civic">
          {isSantaBarbara ? jurisdictionLabel : t(locale, "decisions")}
        </p>
        {isSantaBarbara ? (
          <h1 className="mt-2 text-balance text-2xl font-black text-ink sm:text-4xl">
            {locale === "es" ? "Decisiones" : "Decisions"}
          </h1>
        ) : (
          <h1 className="mt-2 text-balance text-2xl font-black text-ink sm:text-4xl">
            {decisionsTitle(locale, jurisdiction, jurisdictionLabel)}
          </h1>
        )}
        <p className="mt-2 max-w-4xl text-base font-medium leading-7 text-black/70">
          {isSantaBarbara
            ? locale === "es"
              ? "Entiende lo que consideran los líderes del condado y lo que decidieron."
              : "Understand what county leaders are considering—and what they decided."
            : t(locale, "decisionsDescription")}
        </p>
      </div>

      {isSantaBarbara ? (
        <nav
          aria-label={locale === "es" ? "Órgano del condado" : "County body"}
          className="mb-4 flex items-end gap-x-4 overflow-x-auto border-b border-black/10 sm:mb-5 sm:gap-x-7"
        >
          <PendingLink
            href={santaBarbaraBodyHref(params, "all")}
            pendingLabel={locale === "es" ? "Abriendo todas" : "Opening all"}
            aria-current={santaBarbaraBody === "all" ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-[13px] font-black transition sm:text-sm ${
              santaBarbaraBody === "all"
                ? "border-civic text-civic"
                : "border-transparent text-black/60 hover:text-ink"
            }`}
          >
            {locale === "es" ? "Todas" : "All"}
          </PendingLink>
          <PendingLink
            href={santaBarbaraBodyHref(params, "board")}
            pendingLabel={locale === "es" ? "Abriendo Junta de Supervisores" : "Opening Board of Supervisors"}
            aria-current={santaBarbaraBody === "board" ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-[13px] font-black transition sm:text-sm ${
              santaBarbaraBody === "board"
                ? "border-civic text-civic"
                : "border-transparent text-black/60 hover:text-ink"
            }`}
          >
            <span className="sm:hidden">{locale === "es" ? "Junta" : "Board"}</span>
            <span className="hidden sm:inline">
              {locale === "es" ? "Junta de Supervisores" : "Board of Supervisors"}
            </span>
          </PendingLink>
          <PendingLink
            href={santaBarbaraBodyHref(params, "planning")}
            pendingLabel={locale === "es" ? "Abriendo Comisión de Planificación" : "Opening Planning Commission"}
            aria-current={santaBarbaraBody === "planning" ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-[13px] font-black transition sm:text-sm ${
              santaBarbaraBody === "planning"
                ? "border-civic text-civic"
                : "border-transparent text-black/60 hover:text-ink"
            }`}
          >
            {locale === "es" ? "Comisión de Planificación" : "Planning Commission"}
          </PendingLink>
        </nav>
      ) : null}

      {isElectionPromoActive() ? (
        <Link
          href={locale === "es" ? "/elections?lang=es" : "/elections"}
          className="quiet-card group mb-4 flex items-center gap-4 p-4 transition-colors hover:border-civic/30 focus-visible:focus-ring sm:mb-5 sm:p-5"
        >
          <span className="icon-tile-sm">
            <Vote aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-black/[0.58]">
              {locale === "es"
                ? "Elección general de California · 3 de noviembre"
                : "California General Election · November 3"}
            </span>
            <span className="mt-0.5 block text-lg font-black leading-snug text-ink">
              {locale === "es"
                ? "Entiende las 14 propuestas estatales en tu boleta"
                : "Understand the 14 statewide propositions on your ballot"}
            </span>
          </span>
          <ArrowRight
            aria-hidden
            className="h-5 w-5 shrink-0 text-civic transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      ) : null}

      <DecisionBrowser
        key={jurisdiction}
        cards={result.cards}
        initialSearch={search}
        currentPage={result.page}
        pageCount={result.pageCount}
        pageSize={result.pageSize}
        totalCount={result.totalCount}
        selectedCategory={selectedCategory}
        topicCategories={topicCategories}
        selectedResult={selectedResult}
        locale={locale}
        emptyDescription={noCardsDescription(locale, jurisdiction, jurisdictionLabel)}
        resultFilter={
          isSantaBarbara && santaBarbaraBody === "planning"
            ? undefined
            : <DecisionResultSelect selectedResult={selectedResult} locale={locale} />
        }
        resultsCoverageInline={
          !(isSantaBarbara && santaBarbaraBody === "planning") ? (
            <>
              {isAllJurisdictions ? (
                <ResultsFreshnessMenu
                  locale={locale}
                  {...allJurisdictionsFreshness(decisionResultFreshness, locale)}
                />
              ) : (
                <span className="font-bold text-civic">
                  {freshnessLabel(
                    decisionResultFreshness,
                    toPublicJurisdictionSlug(jurisdiction),
                    locale
                  )}
                </span>
              )}
              <span aria-hidden className="mx-1.5 hidden text-black/25 sm:inline">·</span>
              <span className="hidden sm:inline">
                {locale === "es"
                  ? "Las actas oficiales pueden tardar días o semanas."
                  : "Official minutes may take days or weeks."}
              </span>
            </>
          ) : undefined
        }
        showSantaBarbaraInterestPilot={jurisdiction === "santa-barbara-county"}
        mapJurisdiction={jurisdiction}
      />
    </div>
  );
}
