import type { Metadata } from "next";
import { DecisionBrowser } from "@/components/DecisionBrowser";
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
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { categoryFromSlug } from "@/lib/utils/decisionFilters";
import { t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export const revalidate = 300;

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ q?: string; category?: string; jurisdiction?: string; page?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const jurisdiction = params.jurisdiction
    ? normalizeJurisdictionSelection(params.jurisdiction)
    : ALL_JURISDICTIONS_SLUG;
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const label = jurisdiction === ALL_JURISDICTIONS_SLUG ? "Local government" : jurisdictionLabel;
  const title = `${label} decisions | SimpleCity`;
  const description = `Plain-English summaries of ${label.toLowerCase()} decisions, upcoming votes, public meetings, and ways residents can participate.`;
  const canonicalUrl = new URL("/decisions", getConfiguredAppUrl());
  if (params.jurisdiction) {
    canonicalUrl.searchParams.set("jurisdiction", toPublicJurisdictionSlug(jurisdiction));
  }
  const isFiltered = Boolean(params.q || params.category || params.page);

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl.toString() },
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: { title, description, type: "website", url: canonicalUrl.toString(), siteName: "SimpleCity" },
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

function freshnessDateLabel(
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

  return formattedDate;
}

function DecisionResultsCoverage({
  jurisdiction,
  freshness,
  locale
}: {
  jurisdiction: JurisdictionSelection;
  freshness: DecisionResultFreshness;
  locale: "en" | "es";
}) {
  const isAll = jurisdiction === ALL_JURISDICTIONS_SLUG;
  const jurisdictions = isAll
    ? getPublicJurisdictionOptions().filter((option) => option.slug !== ALL_JURISDICTIONS_SLUG)
    : [{ name: getJurisdictionLabel(jurisdiction), slug: toPublicJurisdictionSlug(jurisdiction) }];
  const delayNote =
    locale === "es"
      ? "Las actas oficiales pueden tardar días o semanas en publicarse."
      : "Official minutes may take days or weeks to appear.";

  return (
    <section aria-labelledby="decision-results-coverage">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-5">
        <h2 id="decision-results-coverage" className="font-medium leading-5 text-black/70">
          {locale === "es" ? "Fechas de resultados más recientes" : "Latest result dates"}
        </h2>
        <p className="text-black/55">{delayNote}</p>
      </div>
      <dl
        className={`mt-2 grid gap-x-6 gap-y-2 ${
          isAll ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "max-w-xs grid-cols-1"
        }`}
      >
        {jurisdictions.map((option) => (
          <div key={option.slug} className="min-w-0">
            <dt className="truncate text-xs font-medium text-black/50">{option.name}</dt>
            <dd className="mt-0.5 text-sm font-medium leading-5 text-black/70">
              {freshnessDateLabel(freshness, option.slug, locale)}
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
    jurisdiction?: string;
    page?: string;
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
  const search = (params.q || "").trim();
  const selectedCategory = categoryFromSlug(params.category);
  const currentPage = parsePage(params.page);
  const [result, decisionResultFreshness] = await Promise.all([
    getDecisionCardPage({
      jurisdiction,
      locale,
      search,
      category: selectedCategory,
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
        key={`${jurisdiction}-${selectedCategory || "all"}-${search}`}
        cards={result.cards}
        initialSearch={search}
        currentPage={result.page}
        pageCount={result.pageCount}
        pageSize={result.pageSize}
        totalCount={result.totalCount}
        selectedCategory={selectedCategory}
        jurisdiction={params.jurisdiction}
        locale={locale}
        emptyDescription={noCardsDescription(locale, jurisdiction, jurisdictionLabel)}
        resultsCoverage={
          <DecisionResultsCoverage
            jurisdiction={jurisdiction}
            freshness={decisionResultFreshness}
            locale={locale}
          />
        }
      />
    </div>
  );
}
