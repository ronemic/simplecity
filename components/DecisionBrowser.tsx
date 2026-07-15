"use client";

import { useEffect, useMemo, useState } from "react";
import { DecisionCategorySelector } from "@/components/DecisionCategorySelector";
import { DecisionSearchForm } from "@/components/DecisionSearchForm";
import { PaginationJumpForm } from "@/components/PaginationJumpForm";
import { SummaryCard } from "@/components/SummaryCard";
import { type Locale, t } from "@/lib/i18n";
import type { SummaryCardRow } from "@/lib/types";
import { DECISION_CARD_PAGE_SIZE, type CategoryName } from "@/lib/constants";
import { matchesDecisionFilters } from "@/lib/utils/decisionFilters";

function resultSummary(locale: Locale, start: number, end: number, total: number) {
  if (total === 0) return locale === "es" ? "0 decisiones" : "0 decisions";

  return locale === "es"
    ? `Mostrando ${start}-${end} de ${total} decisiones`
    : `Showing ${start}-${end} of ${total} decisions`;
}

export function DecisionBrowser({
  cards,
  initialSearch,
  initialPage,
  selectedCategory,
  jurisdiction,
  locale,
  emptyDescription
}: {
  cards: SummaryCardRow[];
  initialSearch: string;
  initialPage: number;
  selectedCategory?: CategoryName;
  jurisdiction?: string;
  locale: Locale;
  emptyDescription: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);

  const matchingCards = useMemo(
    () => cards.filter((card) => matchesDecisionFilters(card, search, selectedCategory)),
    [cards, search, selectedCategory]
  );
  const pageCount = Math.ceil(matchingCards.length / DECISION_CARD_PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(1, pageCount));
  const offset = (currentPage - 1) * DECISION_CARD_PAGE_SIZE;
  const visibleCards = matchingCards.slice(offset, offset + DECISION_CARD_PAGE_SIZE);
  const resultStart = matchingCards.length === 0 ? 0 : offset + 1;
  const resultEnd = Math.min(offset + DECISION_CARD_PAGE_SIZE, matchingCards.length);
  const highlight = search.trim();

  useEffect(() => {
    const url = new URL(window.location.href);
    const query = search.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (currentPage > 1) url.searchParams.set("page", String(currentPage));
    else url.searchParams.delete("page");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [currentPage, search]);

  useEffect(() => {
    function syncFromHistory() {
      const url = new URL(window.location.href);
      setSearch(url.searchParams.get("q") || "");
      const requestedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
      setPage(Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1);
    }

    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  function handleSearchChange(nextSearch: string) {
    setSearch(nextSearch);
    setPage(1);
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <p className="count-badge">
          {resultSummary(locale, resultStart, resultEnd, matchingCards.length)}
        </p>
      </div>

      <DecisionSearchForm search={search} onSearchChange={handleSearchChange} locale={locale} />
      <DecisionCategorySelector
        selectedCategory={selectedCategory}
        search={search.trim()}
        jurisdiction={jurisdiction}
        locale={locale}
      />

      <div className="mt-6 grid gap-3" aria-live="polite">
        {visibleCards.map((card) => (
          <SummaryCard key={card.id} card={card} highlight={highlight} locale={locale} />
        ))}
        {visibleCards.length === 0 ? (
          <div className="quiet-card p-8 text-center">
            <h3 className="text-lg font-semibold text-ink">
              {highlight || selectedCategory
                ? t(locale, "noMatchingDecisions")
                : t(locale, "noDecisionsYet")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-black/70">
              {highlight || selectedCategory ? t(locale, "tryChangingFilters") : emptyDescription}
            </p>
          </div>
        ) : null}
      </div>

      {pageCount > 1 ? (
        <nav
          aria-label={locale === "es" ? "Paginación de decisiones" : "Decision pagination"}
          className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5"
        >
          <button
            type="button"
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className={currentPage <= 1 ? "action-disabled-sm" : "action-secondary-sm"}
          >
            {locale === "es" ? "Anterior" : "Previous"}
          </button>
          <PaginationJumpForm
            key={currentPage}
            page={currentPage}
            pageCount={pageCount}
            locale={locale}
            onPageChange={setPage}
          />
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage >= pageCount}
            className={currentPage >= pageCount ? "action-disabled-sm" : "action-secondary-sm"}
          >
            {locale === "es" ? "Siguiente" : "Next"}
          </button>
        </nav>
      ) : null}
    </>
  );
}
