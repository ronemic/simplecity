import type { Metadata } from "next";
import { CalendarCheck2 } from "lucide-react";
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
  getJurisdictionLabel,
  normalizeJurisdictionSelection,
  toInternalJurisdictionSlug,
  toPublicJurisdictionSlug,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import { categoryFromSlug } from "@/lib/utils/decisionFilters";
import { decisionResultFilterFromSlug } from "@/lib/utils/decisionResultFilter";
import { t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";
import { CATEGORIES, SCHOOL_CATEGORIES } from "@/lib/constants";

export const revalidate = 300;

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ q?: string; category?: string; result?: string; jurisdiction?: string; page?: string; lang?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const locale = seoLocale(params.lang);
  const jurisdiction = params.jurisdiction
    ? normalizeJurisdictionSelection(params.jurisdiction)
    : ALL_JURISDICTIONS_SLUG;
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
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
  const urls = localizedSeoUrls(`${canonicalUrl.pathname}${canonicalUrl.search}`, locale);
  const isFiltered = Boolean(params.q || params.category || params.result || params.page);

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
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function freshnessLabel(
  freshness: DecisionResultFreshness,
  slug: string,
  locale: "en" | "es"
) {
  const internalSlug = toInternalJurisdictionSlug(slug);
  if (!internalSlug || !Object.prototype.hasOwnProperty.call(freshness, internalSlug)) {
    return locale === "es" ? "Fecha no disponible" : "Date unavailable";
  }

  const value = freshness[internalSlug as keyof DecisionResultFreshness];
  if (!value) return locale === "es" ? "Aún no hay resultados" : "No results yet";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return locale === "es" ? "Fecha no disponible" : "Date unavailable";
  }

  const formattedDate = new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(parsed);

  return locale === "es"
    ? `Resultados hasta el ${formattedDate}`
    : `Results through ${formattedDate}`;
}

function DecisionResultsCoverage({
  jurisdiction,
  jurisdictionLabel,
  freshness,
  locale
}: {
  jurisdiction: JurisdictionSelection;
  jurisdictionLabel: string;
  freshness: DecisionResultFreshness;
  locale: "en" | "es";
}) {
  const isAll = jurisdiction === ALL_JURISDICTIONS_SLUG;
  const jurisdictions = isAll
    ? getPublicJurisdictionOptions().filter((option) => option.slug !== ALL_JURISDICTIONS_SLUG)
    : [{ name: jurisdictionLabel, slug: toPublicJurisdictionSlug(jurisdiction) }];

  return (
    <section className="rounded-lg border border-civic/20 bg-[#f4f8fc] px-3.5 py-3 shadow-sm" aria-labelledby="decision-results-coverage">
      <div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarCheck2 aria-hidden className="h-4 w-4 shrink-0 text-civic" />
            <h2 id="decision-results-coverage" className="text-xs font-black uppercase tracking-wide text-ink">
              {locale === "es" ? "Resultados más recientes" : "Latest decision results"}
            </h2>
          </div>
          <p className="mt-1 text-xs font-medium leading-4 text-black/70">
            {locale === "es"
              ? "Los resultados siguen a las actas oficiales, que pueden tardar días o semanas en publicarse después de una reunión."
              : "Results follow official minutes, which may take days or weeks to appear after a meeting."}
          </p>
        </div>
      </div>
      <dl className="mt-3 grid gap-1 text-xs sm:flex sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
        {jurisdictions.map((option) => (
          <div key={option.slug} className="flex min-w-0 items-baseline gap-1.5">
            <dt className="shrink-0 font-bold text-black/60">{option.name}</dt>
            <dd className="min-w-0 font-black text-civic">
              {freshnessLabel(freshness, option.slug, locale)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function DecisionsPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    result?: string;
    jurisdiction?: string;
    page?: string;
    lang?: string;
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
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const isSchoolDistrict = jurisdiction === "los-altos-school-district";
  const topicCategories = isSchoolDistrict ? SCHOOL_CATEGORIES : CATEGORIES;
  const search = (params.q || "").trim();
  const selectedCategory = categoryFromSlug(params.category, topicCategories);
  const selectedResult = decisionResultFilterFromSlug(params.result);
  const currentPage = parsePage(params.page);
  const [result, decisionResultFreshness] = await Promise.all([
    getDecisionCardPage({
      jurisdiction,
      locale,
      search,
      category: selectedCategory,
      result: selectedResult,
      page: currentPage
    }),
    getDecisionResultFreshness()
  ]);

  return (
    <div className="section-shell py-10">
      <div className="mb-6 max-w-3xl">
        <p className="label-eyebrow text-civic">{t(locale, "decisions")}</p>
        <h1 className="page-title mt-2">
          {decisionsTitle(locale, jurisdiction, jurisdictionLabel)}
        </h1>
        <p className="page-copy mt-3 text-base">
          {t(locale, "decisionsDescription")}
        </p>
      </div>

      <DecisionBrowser
        key={`${jurisdiction}-${selectedCategory || "all"}-${selectedResult || "all"}-${search}`}
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
        resultFilter={<DecisionResultSelect selectedResult={selectedResult} locale={locale} />}
        resultsCoverage={
          <DecisionResultsCoverage
            jurisdiction={jurisdiction}
            jurisdictionLabel={jurisdictionLabel}
            freshness={decisionResultFreshness}
            locale={locale}
          />
        }
        showSantaBarbaraInterestPilot={jurisdiction === "santa-barbara-county"}
      />
    </div>
  );
}
