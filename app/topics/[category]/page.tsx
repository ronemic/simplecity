import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SummaryCard } from "@/components/SummaryCard";
import { CategoryPill } from "@/components/CategoryPill";
import { PendingLink } from "@/components/PendingLink";
import { ALL_CATEGORIES, CATEGORY_DEFINITIONS, MAX_DECISION_CARD_PAGE } from "@/lib/constants";
import { getDecisionCardPage } from "@/lib/db/queries";
import { decisionPeriodFromParam } from "@/lib/utils/decisionFilters";
import { cookies } from "next/headers";
import {
  ALL_JURISDICTIONS_SLUG,
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionLabel,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { categoryDescription, categoryLabel, t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";

export const revalidate = 300;

// Topics like Parks & Environment have 1,000+ cards across jurisdictions;
// rendering them all produced ~8 MB pages.
const TOPIC_CARD_PAGE_SIZE = 24;

type TopicSearchParams = { period?: string; jurisdiction?: string; page?: string; lang?: string };

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value || "", 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_DECISION_CARD_PAGE);
}

function categoryFromSlug(slug: string) {
  return ALL_CATEGORIES.find((category) => CATEGORY_DEFINITIONS[category].slug === slug);
}

export async function generateMetadata({
  params,
  searchParams
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<TopicSearchParams>;
}): Promise<Metadata> {
  const [{ category: slug }, query] = await Promise.all([params, searchParams]);
  const category = categoryFromSlug(slug);
  if (!category) return { title: "Topic not found | SimpleCity", robots: { index: false } };
  const locale = seoLocale(query.lang);

  const jurisdiction = query.jurisdiction
    ? normalizeJurisdictionSelection(query.jurisdiction)
    : ALL_JURISDICTIONS_SLUG;
  const jurisdictionPrefix =
    jurisdiction === ALL_JURISDICTIONS_SLUG ? "Local" : getJurisdictionLabel(jurisdiction, locale);
  const definition = CATEGORY_DEFINITIONS[category];
  const title =
    locale === "es"
      ? `${jurisdiction === ALL_JURISDICTIONS_SLUG ? "Decisiones locales" : `Decisiones de ${jurisdictionPrefix}`} sobre ${categoryLabel(locale, category).toLowerCase()} | SimpleCity`
      : `${jurisdictionPrefix} ${category.toLowerCase()} decisions | SimpleCity`;
  const description = locale === "es" ? categoryDescription(locale, category) : definition.description;
  const canonicalUrl = new URL(`/topics/${definition.slug}`, getConfiguredAppUrl());
  if (query.jurisdiction) {
    canonicalUrl.searchParams.set("jurisdiction", toPublicJurisdictionSlug(jurisdiction));
  }
  const urls = localizedSeoUrls(canonicalUrl, locale);

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages },
    robots: query.period || query.page ? { index: false, follow: true } : undefined,
    openGraph: { title, description, type: "website", url: urls.canonical, siteName: "SimpleCity" },
    twitter: { card: "summary", title, description }
  };
}

export default async function CategoryDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<TopicSearchParams>;
}) {
  const [{ category: slug }, query, locale, cookieStore] = await Promise.all([
    params,
    searchParams,
    getRequestLocale(),
    cookies()
  ]);
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const jurisdiction = normalizeJurisdictionSelection(
    query.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const jurisdictionParam = query.jurisdiction
    ? `jurisdiction=${encodeURIComponent(toPublicJurisdictionSlug(jurisdiction))}`
    : "";
  const definition = CATEGORY_DEFINITIONS[category];
  const period = decisionPeriodFromParam(query.period);
  const result = await getDecisionCardPage({
    jurisdiction,
    locale,
    category,
    period,
    page: parsePage(query.page),
    pageSize: TOPIC_CARD_PAGE_SIZE
  });
  const filtered = result.cards;
  const pageHref = (page: number) =>
    `/topics/${slug}?${[
      jurisdictionParam,
      period ? `period=${period}` : "",
      page > 1 ? `page=${page}` : ""
    ].filter(Boolean).join("&")}`.replace(/\?$/, "");

  const Icon = definition.icon;

  return (
    <div className="section-shell py-10">
      <div className="mb-8 max-w-3xl">
        <span className="icon-tile-lg">
          <Icon aria-hidden className="h-6 w-6" />
        </span>
        <h1 className="page-title mt-4">{categoryLabel(locale, category)}</h1>
        <p className="page-copy mt-3 text-base">{categoryDescription(locale, category)}</p>
        <div className="mt-4">
          <CategoryPill category={category} locale={locale} />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          {
            href: `/topics/${slug}${jurisdictionParam ? `?${jurisdictionParam}` : ""}`,
            label: t(locale, "all"),
            selected: !period
          },
          {
            href: `/topics/${slug}?${[
              jurisdictionParam,
              "period=upcoming"
            ].filter(Boolean).join("&")}`,
            label: t(locale, "upcoming"),
            selected: period === "upcoming"
          },
          {
            href: `/topics/${slug}?${[
              jurisdictionParam,
              "period=past"
            ].filter(Boolean).join("&")}`,
            label: t(locale, "past"),
            selected: period === "past"
          }
        ].map((item) => (
          <PendingLink
            key={item.href}
            href={item.href}
            aria-current={item.selected ? "true" : undefined}
            className={`chip chip-action chip-lg ${item.selected ? "chip-selected" : ""}`}
            pendingLabel={`${t(locale, "loading")} ${item.label.toLowerCase()}`}
          >
            {item.label}
          </PendingLink>
        ))}
      </div>

      <div className="grid gap-4">
        {filtered.map((card) => (
          <SummaryCard key={card.id} card={card} locale={locale} />
        ))}
        {filtered.length === 0 ? (
          <div className="quiet-card p-8 text-center">
            <h2 className="text-xl font-bold text-ink">{t(locale, "noCardsInCategory")}</h2>
            <p className="mt-2 text-sm leading-6 text-black/70">
              {t(locale, "noCardsInCategoryDescription")}
            </p>
          </div>
        ) : null}
      </div>

      {result.pageCount > 1 ? (
        <nav
          aria-label={locale === "es" ? "Paginación de decisiones" : "Decision pagination"}
          className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5"
        >
          {result.page > 1 ? (
            <PendingLink
              href={pageHref(result.page - 1)}
              className="action-secondary-sm min-w-24"
              pendingLabel={locale === "es" ? "Cargando página anterior" : "Loading previous page"}
            >
              {locale === "es" ? "Anterior" : "Previous"}
            </PendingLink>
          ) : (
            <span aria-disabled="true" className="action-disabled-sm min-w-24">
              {locale === "es" ? "Anterior" : "Previous"}
            </span>
          )}
          <span className="text-sm font-bold text-black/60">
            {locale === "es"
              ? `Página ${result.page} de ${result.pageCount} · ${result.totalCount} decisiones`
              : `Page ${result.page} of ${result.pageCount} · ${result.totalCount} decisions`}
          </span>
          {result.page < result.pageCount ? (
            <PendingLink
              href={pageHref(result.page + 1)}
              className="action-secondary-sm min-w-24"
              pendingLabel={locale === "es" ? "Cargando página siguiente" : "Loading next page"}
            >
              {locale === "es" ? "Siguiente" : "Next"}
            </PendingLink>
          ) : (
            <span aria-disabled="true" className="action-disabled-sm min-w-24">
              {locale === "es" ? "Siguiente" : "Next"}
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
