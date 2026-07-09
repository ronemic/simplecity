import { DecisionSearchForm } from "@/components/DecisionSearchForm";
import { DecisionCategorySelector } from "@/components/DecisionCategorySelector";
import { PendingLink } from "@/components/PendingLink";
import { SummaryCard } from "@/components/SummaryCard";
import { getDecisionCardPage } from "@/lib/db/queries";
import { cookies } from "next/headers";
import {
  ALL_JURISDICTIONS_SLUG,
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionLabel,
  normalizeJurisdictionSelection
} from "@/lib/config/jurisdictions";
import { CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import { categoryFromSlug } from "@/lib/utils/decisionFilters";
import { t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export const revalidate = 300;

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

function pageHref({
  search,
  category,
  jurisdiction,
  page
}: {
  search: string;
  category?: CategoryName;
  jurisdiction?: string;
  page: number;
}) {
  const params = new URLSearchParams();
  if (jurisdiction) params.set("jurisdiction", jurisdiction);
  if (search) params.set("q", search);
  if (category) params.set("category", CATEGORY_DEFINITIONS[category].slug);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/decisions${query ? `?${query}` : ""}`;
}

function resultSummary(locale: "en" | "es", start: number, end: number, total: number) {
  if (total === 0) return locale === "es" ? "0 decisiones" : "0 decisions";

  return locale === "es"
    ? `Mostrando ${start}-${end} de ${total} decisiones`
    : `Showing ${start}-${end} of ${total} decisions`;
}

function PaginationJumpForm({
  search,
  category,
  jurisdiction,
  page,
  pageCount,
  locale
}: {
  search: string;
  category?: CategoryName;
  jurisdiction?: string;
  page: number;
  pageCount: number;
  locale: "en" | "es";
}) {
  return (
    <form
      action="/decisions"
      className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold text-black/60"
    >
      {jurisdiction ? <input type="hidden" name="jurisdiction" value={jurisdiction} /> : null}
      {search ? <input type="hidden" name="q" value={search} /> : null}
      {category ? (
        <input type="hidden" name="category" value={CATEGORY_DEFINITIONS[category].slug} />
      ) : null}
      <label className="inline-flex items-center gap-2">
        <span>{locale === "es" ? "Página" : "Page"}</span>
        <input
          aria-label={locale === "es" ? "Número de página" : "Page number"}
          className="h-9 w-16 rounded-lg border border-black/15 bg-white px-2 text-center text-sm font-black text-ink shadow-sm focus:border-civic focus:outline-none focus:ring-4 focus:ring-civic/15"
          defaultValue={page}
          inputMode="numeric"
          max={pageCount}
          min={1}
          name="page"
          type="number"
        />
      </label>
      <span>{locale === "es" ? `de ${pageCount}` : `of ${pageCount}`}</span>
      <button className="action-secondary-sm min-h-9 px-3 py-1.5" type="submit">
        {locale === "es" ? "Ir" : "Go"}
      </button>
    </form>
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
  const decisionPage = await getDecisionCardPage({
    jurisdiction,
    locale,
    search,
    category: selectedCategory,
    page: currentPage
  });
  const resultStart =
    decisionPage.totalCount === 0 ? 0 : (decisionPage.page - 1) * decisionPage.pageSize + 1;
  const resultEnd = Math.min(decisionPage.page * decisionPage.pageSize, decisionPage.totalCount);

  return (
    <div className="section-shell py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="label-eyebrow text-civic">{t(locale, "decisions")}</p>
          <h1 className="page-title mt-2">
            {decisionsTitle(locale, jurisdiction, jurisdictionLabel)}
          </h1>
          <p className="page-copy mt-3 text-base">
            {t(locale, "decisionsDescription")}
          </p>
        </div>
        <p className="count-badge self-start sm:self-auto">
          {resultSummary(locale, resultStart, resultEnd, decisionPage.totalCount)}
        </p>
      </div>

      <DecisionSearchForm search={params.q || ""} locale={locale} />
      <DecisionCategorySelector
        selectedCategory={selectedCategory}
        search={search}
        jurisdiction={params.jurisdiction}
        locale={locale}
      />

      <div className="mt-6 grid gap-3" aria-live="polite">
        {decisionPage.cards.map((card) => (
          <SummaryCard key={card.id} card={card} highlight={search} locale={locale} />
        ))}
        {decisionPage.cards.length === 0 ? (
          <div className="quiet-card p-8 text-center">
            <h3 className="text-lg font-semibold text-ink">
              {search || selectedCategory ? t(locale, "noMatchingDecisions") : t(locale, "noDecisionsYet")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-black/70">
              {search || selectedCategory
                ? t(locale, "tryChangingFilters")
                : noCardsDescription(locale, jurisdiction, jurisdictionLabel)}
            </p>
          </div>
        ) : null}
      </div>

      {decisionPage.pageCount > 1 ? (
        <nav
          aria-label={locale === "es" ? "Paginación de decisiones" : "Decision pagination"}
          className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5"
        >
          <PendingLink
            href={pageHref({
              search,
              category: selectedCategory,
              jurisdiction: params.jurisdiction,
              page: Math.max(1, decisionPage.page - 1)
            })}
            aria-disabled={decisionPage.page <= 1 ? "true" : undefined}
            className={decisionPage.page <= 1 ? "action-disabled-sm" : "action-secondary-sm"}
            pendingLabel={locale === "es" ? "Cargando página anterior" : "Loading previous page"}
          >
            {locale === "es" ? "Anterior" : "Previous"}
          </PendingLink>
          <PaginationJumpForm
            search={search}
            category={selectedCategory}
            jurisdiction={params.jurisdiction}
            page={decisionPage.page}
            pageCount={decisionPage.pageCount}
            locale={locale}
          />
          <PendingLink
            href={pageHref({
              search,
              category: selectedCategory,
              jurisdiction: params.jurisdiction,
              page: Math.min(decisionPage.pageCount, decisionPage.page + 1)
            })}
            aria-disabled={decisionPage.page >= decisionPage.pageCount ? "true" : undefined}
            className={
              decisionPage.page >= decisionPage.pageCount ? "action-disabled-sm" : "action-secondary-sm"
            }
            pendingLabel={locale === "es" ? "Cargando página siguiente" : "Loading next page"}
          >
            {locale === "es" ? "Siguiente" : "Next"}
          </PendingLink>
        </nav>
      ) : null}
    </div>
  );
}
