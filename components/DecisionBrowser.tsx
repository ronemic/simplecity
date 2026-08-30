"use client";

import { List, Loader2, Map as MapIcon, Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { DecisionFilters } from "@/components/DecisionFilters";
import { DecisionSearchForm } from "@/components/DecisionSearchForm";
import { PaginationJumpForm } from "@/components/PaginationJumpForm";
import { SummaryCard } from "@/components/SummaryCard";
import { type Locale, t } from "@/lib/i18n";
import type { SummaryCardRow } from "@/lib/types";
import { type CategoryName } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import type { DecisionResultFilter as ResultFilter } from "@/lib/utils/decisionResultFilter";
import {
  SantaBarbaraInterestHub,
  type SantaBarbaraDecisionView
} from "@/components/SantaBarbaraInterestHub";
import { DecisionMapPanel } from "@/components/DecisionMapPanel";

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
  topicCategories,
  selectedResult,
  locale,
  emptyDescription,
  resultFilter,
  resultsCoverage,
  resultsCoverageInline,
  showTopicFilters = true,
  showSantaBarbaraInterestPilot = false,
  mapJurisdiction
}: {
  cards: SummaryCardRow[];
  initialSearch: string;
  currentPage: number;
  pageCount: number;
  pageSize: number;
  totalCount: number;
  selectedCategory?: CategoryName;
  topicCategories?: readonly CategoryName[];
  selectedResult?: ResultFilter;
  locale: Locale;
  emptyDescription: string;
  resultFilter?: ReactNode;
  resultsCoverage?: ReactNode;
  resultsCoverageInline?: ReactNode;
  showTopicFilters?: boolean;
  showSantaBarbaraInterestPilot?: boolean;
  mapJurisdiction: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const submittedSearch = useRef(initialSearch);
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [santaBarbaraView, setSantaBarbaraView] = useState<SantaBarbaraDecisionView>("all");
  const [showSearch, setShowSearch] = useState(Boolean(initialSearch));
  const [showFilters, setShowFilters] = useState(Boolean(selectedCategory || selectedResult));
  const [mapPointCount, setMapPointCount] = useState<{ key: string; count: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const decisionView = searchParams.get("view") === "map" ? "map" : "list";
  const resultStart = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const resultEnd = totalCount === 0 ? 0 : resultStart + cards.length - 1;
  const highlight = initialSearch.trim();
  const mapParams = new URLSearchParams(searchParams.toString());
  mapParams.set("jurisdiction", mapJurisdiction);
  mapParams.delete("page");
  mapParams.delete("view");
  const mapQuery = mapParams.toString();
  const mapPointCountKey = `${locale}:${mapQuery}`;
  const visibleMapPointCount = mapPointCount?.key === mapPointCountKey
    ? mapPointCount.count
    : null;
  const updateMapPointCount = useCallback((count: number) => {
    setMapPointCount({ key: mapPointCountKey, count });
  }, [mapPointCountKey]);

  useEffect(() => {
    // The URL changed from outside this input (back/forward, a filter link):
    // adopt it instead of pushing the stale local value back.
    if (initialSearch !== submittedSearch.current) {
      submittedSearch.current = initialSearch;
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  useEffect(() => {
    const query = search.trim();
    if (query === initialSearch) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query);
      else params.delete("q");
      params.delete("page");
      const nextUrl = `${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`;

      submittedSearch.current = query;
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

  function changeDecisionView(view: "list" | "map") {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "map") params.set("view", "map");
    else params.delete("view");
    params.delete("page");
    const nextUrl = `${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`;

    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }

  // Shared with the expanded map, which covers the page these normally sit on.
  // Same markup in both places, so the controls behave identically.
  const searchToggle = (
    <button
      type="button"
      aria-expanded={showSearch}
      onClick={() => setShowSearch((value) => !value)}
      className="action-link !min-h-8 !px-1 !text-xs sm:!min-h-10 sm:!px-2 sm:!text-sm"
    >
      <Search aria-hidden className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      {locale === "es" ? "Buscar" : "Search"}
    </button>
  );

  const filterToggle = (
    <button
      type="button"
      aria-expanded={showFilters}
      onClick={() => setShowFilters((value) => !value)}
      className="action-link !min-h-8 !px-1 !text-xs sm:!min-h-10 sm:!px-2 sm:!text-sm"
    >
      <SlidersHorizontal aria-hidden className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      {locale === "es" ? "Filtros" : "Filters"}
      {selectedCategory || selectedResult ? (
        <span className="tabular-nums text-black/45">
          {[selectedCategory, selectedResult].filter(Boolean).length}
        </span>
      ) : null}
    </button>
  );

  const searchPanel = showSearch ? (
    <div className="max-w-3xl border-b border-black/10 py-3" aria-busy={isPending}>
      <DecisionSearchForm search={search} onSearchChange={setSearch} locale={locale} />
    </div>
  ) : null;

  const filterPanel = showFilters ? (
    <div className="border-b border-black/10 py-3">
      {resultFilter ? <div className="max-w-xs">{resultFilter}</div> : null}
      {showTopicFilters ? (
        <div className={resultFilter ? "mt-3" : ""}>
          <DecisionFilters
            selectedCategory={selectedCategory}
            categories={topicCategories}
            locale={locale}
          />
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      {showSantaBarbaraInterestPilot && santaBarbaraView === "interests" ? (
        <SantaBarbaraInterestHub
          activeView={santaBarbaraView}
          locale={locale}
          onViewChange={setSantaBarbaraView}
        />
      ) : null}

      {santaBarbaraView === "all" ? (
        <>
          <div className="mb-5">
            {resultsCoverage}
            <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2 border-b border-black/10 py-2.5 sm:py-3">
              <div>
                <h2 className="text-base font-black text-ink sm:text-lg">
                  {locale === "es" ? "Decisiones recientes" : "Latest decisions"}
                </h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-black/50">
                  <p aria-live="polite" className="inline-flex items-center gap-2">
                    {isPending || (decisionView === "map" && visibleMapPointCount === null) ? (
                      <>
                        <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                        {decisionView === "map"
                          ? locale === "es" ? "Actualizando el mapa" : "Updating map"
                          : locale === "es" ? "Actualizando resultados" : "Updating results"}
                      </>
                    ) : decisionView === "map" ? (
                      locale === "es"
                        ? `${visibleMapPointCount} decisiones en el mapa`
                        : `${visibleMapPointCount} mapped decisions`
                    ) : resultSummary(locale, resultStart, resultEnd, totalCount)}
                  </p>
                  {resultsCoverageInline ? (
                    <>
                      <span aria-hidden className="text-black/25">·</span>
                      <p>{resultsCoverageInline}</p>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 sm:w-auto sm:gap-x-4">
                <div
                  className="segmented-control w-full sm:w-auto"
                  aria-label={locale === "es" ? "Vista de decisiones" : "Decision view"}
                >
                  <button
                    type="button"
                    aria-current={decisionView === "list" ? "page" : undefined}
                    onClick={() => changeDecisionView("list")}
                    className={cn(
                      "segmented-button",
                      "flex-1 justify-center sm:flex-none",
                      decisionView === "list" && "segmented-button-selected"
                    )}
                  >
                    <List aria-hidden className="h-4 w-4" />
                    {locale === "es" ? "Lista" : "List"}
                  </button>
                  <button
                    type="button"
                    aria-current={decisionView === "map" ? "page" : undefined}
                    onClick={() => changeDecisionView("map")}
                    className={cn(
                      "segmented-button",
                      "flex-1 justify-center sm:flex-none",
                      decisionView === "map" && "segmented-button-selected"
                    )}
                  >
                    <MapIcon aria-hidden className="h-4 w-4" />
                    {locale === "es" ? "Mapa" : "Map"}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wide",
                        decisionView === "map"
                          ? "bg-white/20 text-white"
                          : "bg-clay/10 text-clay"
                      )}
                    >
                      {locale === "es" ? "Nuevo" : "New"}
                    </span>
                  </button>
                </div>
                {searchToggle}
                {filterToggle}
                {showSantaBarbaraInterestPilot ? (
                  <SantaBarbaraInterestHub
                    activeView="all"
                    locale={locale}
                    onViewChange={setSantaBarbaraView}
                    inline
                  />
                ) : null}
              </div>
            </div>

            {searchPanel}
            {filterPanel}
          </div>

          {decisionView === "map" ? (
            <DecisionMapPanel
              query={mapQuery}
              locale={locale}
              onPointCountChange={updateMapPointCount}
              controlToggles={
                <>
                  {searchToggle}
                  {filterToggle}
                </>
              }
              controlPanels={
                <>
                  {searchPanel}
                  {filterPanel}
                </>
              }
            />
          ) : (
            <div className="grid gap-3" aria-live="polite">
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
          )}

          {decisionView === "list" && pageCount > 1 ? (
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
