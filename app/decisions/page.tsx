import type { Metadata } from "next";
import { DecisionBrowser } from "@/components/DecisionBrowser";
import { getDecisionCardPage } from "@/lib/db/queries";
import { cookies } from "next/headers";
import {
  ALL_JURISDICTIONS_SLUG,
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionLabel,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
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
  const result = await getDecisionCardPage({
    jurisdiction,
    locale,
    search,
    category: selectedCategory,
    page: currentPage
  });

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
      />
    </div>
  );
}
