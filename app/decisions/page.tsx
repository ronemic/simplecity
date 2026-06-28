import { DecisionSearchForm } from "@/components/DecisionSearchForm";
import { DecisionCategorySelector } from "@/components/DecisionCategorySelector";
import { SummaryCard } from "@/components/SummaryCard";
import { getPublishedCards } from "@/lib/db/queries";
import { cookies } from "next/headers";
import {
  ALL_JURISDICTIONS_SLUG,
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionLabel,
  normalizeJurisdictionSelection
} from "@/lib/config/jurisdictions";
import {
  compareCardsByPublicInterest
} from "@/lib/utils/civicPriority";
import { categoryFromSlug, matchesDecisionFilters } from "@/lib/utils/decisionFilters";
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
      : "Official agenda cards will appear here once meetings are scraped.";
  }

  return locale === "es"
    ? `Las tarjetas oficiales de agenda de ${jurisdictionLabel} aparecerán aquí cuando se recopilen las reuniones.`
    : `Official ${jurisdictionLabel} agenda cards will appear here once meetings are scraped.`;
}

export default async function DecisionsPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
  }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const cookieStore = await cookies();
  const jurisdiction = normalizeJurisdictionSelection(
    cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const search = (params.q || "").trim();
  const selectedCategory = categoryFromSlug(params.category);

  const cards = await getPublishedCards(jurisdiction, locale);
  const filteredCards = cards.filter((card) =>
    matchesDecisionFilters(card, search, selectedCategory)
  );
  const prioritizedCards = [...filteredCards].sort(compareCardsByPublicInterest);

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

      <DecisionSearchForm search={params.q || ""} locale={locale} />
      <DecisionCategorySelector selectedCategory={selectedCategory} search={search} locale={locale} />

      <div className="mt-6 grid gap-3" aria-live="polite">
        {prioritizedCards.map((card) => (
          <SummaryCard key={card.id} card={card} highlight={search} locale={locale} />
        ))}
        {filteredCards.length === 0 ? (
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
    </div>
  );
}
