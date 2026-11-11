import { Search } from "lucide-react";
import Link from "next/link";
import { type Locale, t } from "@/lib/i18n";

export function SearchAndFilters({
  resultCount,
  search = "",
  action = "/#search-results",
  locale = "en"
}: {
  resultCount?: number;
  search?: string;
  action?: string;
  locale?: Locale;
}) {
  const hasSearch = search.trim().length > 0;
  const resultLabel =
    locale === "es"
      ? resultCount === 1
        ? "1 resultado"
        : `${resultCount ?? 0} resultados`
      : resultCount === 1
        ? "1 result"
        : `${resultCount ?? 0} results`;

  return (
    <div className="w-full">
      <form
        className="flex w-full gap-2"
        action={action}
        role="search"
      >
        <label className="relative flex flex-1">
          <span className="sr-only">{t(locale, "searchDecisionsMeetingsTopics")}</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-black/40"
          />
          <input
            name="q"
            defaultValue={search}
            placeholder={
              locale === "es"
                ? "Prueba “vivienda”, “parque” o el nombre de una calle"
                : "Try “housing”, “bike lanes”, or a street name"
            }
            className="min-h-[52px] w-full rounded-md border-2 border-transparent bg-white py-2.5 pl-11 pr-3 text-base font-semibold text-ink placeholder:font-medium placeholder:text-black/50 focus:border-[#9fc4f4] focus:outline-none"
          />
        </label>
        <button className="inline-flex min-h-[52px] shrink-0 items-center justify-center gap-2 rounded-md bg-civic px-4 text-base font-black text-white transition hover:bg-[#1d4a8f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#142234] sm:px-6">
          <Search aria-hidden className="h-5 w-5 sm:hidden" />
          <span className="sr-only sm:not-sr-only">{t(locale, "search")}</span>
        </button>
      </form>

      {hasSearch && resultCount !== undefined ? (
        <div
          role="status"
          className="mt-3 flex flex-col items-start justify-between gap-2 rounded-lg border border-white/[0.16] bg-white/10 px-4 py-3 text-sm font-semibold text-[#e9f2ff] sm:flex-row"
        >
          <span>
            {locale === "es"
              ? `Mostrando ${resultLabel} para "${search.trim()}".`
              : `Showing ${resultLabel} for "${search.trim()}".`}
          </span>
          <Link
            href="#search-results"
            className="rounded-md py-1 text-[#b9d7ff] underline-offset-4 hover:underline focus-visible:focus-ring sm:px-2"
          >
            {t(locale, "viewResults")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
