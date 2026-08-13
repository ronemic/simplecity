"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { DecisionFilters } from "@/components/DecisionFilters";
import { DecisionSearchForm } from "@/components/DecisionSearchForm";
import { PaginationJumpForm } from "@/components/PaginationJumpForm";
import { SummaryCard } from "@/components/SummaryCard";
import { type Locale, t } from "@/lib/i18n";
import type { SummaryCardRow } from "@/lib/types";
import { type CategoryName } from "@/lib/constants";
import type { DecisionResultFilter as ResultFilter } from "@/lib/utils/decisionResultFilter";
import {
  SantaBarbaraInterestHub,
  type SantaBarbaraDecisionView
} from "@/components/SantaBarbaraInterestHub";

function resultSummary(locale: Locale, start: number, end: number, total: number) {
  if (total === 0) return locale === "es" ? "0 decisiones" : "0 decisions";

  return locale === "es"
    ? `Mostrando ${start}-${end} de ${total} decisiones`
    : `Showing ${start}-${end} of ${total} decisions`;
}

export function DecisionBrowser({
  cards,
  initialSearch,
  currentPage,
  pageCount,
  pageSize,
  totalCount,
  selectedCategory,
  selectedResult,
  locale,
  emptyDescription,
  resultFilter,
  resultsCoverage,
  showTopicFilters = true,
  showSantaBarbaraInterestPilot = false
}: {
  cards: SummaryCardRow[];
  initialSearch: string;
  currentPage: number;
  pageCount: number;
  pageSize: number;
  totalCount: number;
  selectedCategory?: CategoryName;
  selectedResult?: ResultFilter;
  locale: Locale;
  emptyDescription: string;
  resultFilter?: ReactNode;
  resultsCoverage?: ReactNode;
  showTopicFilters?: boolean;
  showSantaBarbaraInterestPilot?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [santaBarbaraView, setSantaBarbaraView] = useState<SantaBarbaraDecisionView>("all");
  const [isPending, startTransition] = useTransition();
  const resultStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const resultEnd = totalCount === 0 ? 0 : resultStart + cards.length - 1;
  const highlight = initialSearch.trim();

  useEffect(() => {
    const query = search.trim();
    if (query === initialSearch) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query);
      else params.delete("q");
      params.delete("page");
      const nextUrl = `${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`;

      startTransition(() => {
        router.replace(nextUrl, { scroll: false });
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [initialSearch, pathname, router, search, searchParams]);

  function pageUrl(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page > 1) params.set("page", String(page));
    else params.delete("page");
    return `${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`;
  }

  function changePage(page: number) {
    setPendingPage(page);
    startTransition(() => {
      router.push(pageUrl(page));
    });
  }

  return (
    <>
      {showSantaBarbaraInterestPilot ? (
        <SantaBarbaraInterestHub
          activeView={santaBarbaraView}
          locale={locale}
          onViewChange={setSantaBarbaraView}
        />
      ) : null}

      {santaBarbaraView === "all" ? (
        <>
          <div className="mb-5 grid gap-3">
            {resultsCoverage}
            <div className="grid gap-2.5 sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0">{resultFilter}</div>
              <div className="flex min-w-0 sm:justify-end">
                <p aria-live="polite" className="count-badge w-full justify-center gap-2 text-center sm:w-auto sm:whitespace-nowrap">
                  {isPending ? (
                    <>
                      <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                      {locale === "es" ? "Actualizando resultados" : "Updating results"}
                    </>
                  ) : (
                    resultSummary(locale, resultStart, resultEnd, totalCount)
                  )}
                </p>
              </div>
            </div>
          </div>

          <div aria-busy={isPending}>
            <DecisionSearchForm search={search} onSearchChange={setSearch} locale={locale} />
          </div>
          {showTopicFilters ? (
            <DecisionFilters
              selectedCategory={selectedCategory}
              locale={locale}
            />
          ) : null}

          <div className="mt-6 grid gap-3" aria-live="polite">
            {cards.map((card) => (
              <SummaryCard key={card.id} card={card} highlight={highlight} locale={locale} />
            ))}
            {cards.length === 0 ? (
              <div className="quiet-card p-8 text-center">
                <h3 className="text-lg font-semibold text-ink">
                  {initialSearch || selectedCategory || selectedResult
                    ? t(locale, "noMatchingDecisions")
                    : t(locale, "noDecisionsYet")}
                </h3>
                <p className="mt-2 text-sm leading-6 text-black/70">
                  {initialSearch || selectedCategory || selectedResult ? t(locale, "tryChangingFilters") : emptyDescription}
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
                onClick={() => changePage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                aria-busy={isPending && pendingPage === currentPage - 1}
                className={`min-w-24 ${currentPage <= 1 ? "action-disabled-sm" : "action-secondary-sm"}`}
              >
                {isPending && pendingPage === currentPage - 1 ? (
                  <>
                    <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                    <span className="sr-only">
                      {locale === "es" ? "Cargando página anterior" : "Loading previous page"}
                    </span>
                  </>
                ) : locale === "es" ? (
                  "Anterior"
                ) : (
                  "Previous"
                )}
              </button>
              <PaginationJumpForm
                key={currentPage}
                page={currentPage}
                pageCount={pageCount}
                locale={locale}
                onPageChange={changePage}
              />
              <button
                type="button"
                onClick={() => changePage(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage >= pageCount}
                aria-busy={isPending && pendingPage === currentPage + 1}
                className={`min-w-24 ${currentPage >= pageCount ? "action-disabled-sm" : "action-secondary-sm"}`}
              >
                {isPending && pendingPage === currentPage + 1 ? (
                  <>
                    <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                    <span className="sr-only">
                      {locale === "es" ? "Cargando página siguiente" : "Loading next page"}
                    </span>
                  </>
                ) : locale === "es" ? (
                  "Siguiente"
                ) : (
                  "Next"
                )}
              </button>
            </nav>
          ) : null}
        </>
      ) : null}
    </>
  );
}
