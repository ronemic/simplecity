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
    <div className="search-panel w-full">
      <form className="relative" action={action} role="search">
        <label>
          <span className="sr-only">{t(locale, "searchDecisionsMeetingsTopics")}</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-quiet"
          />
          <input
            name="q"
            defaultValue={search}
            placeholder={t(locale, "searchDecisions")}
            className="input-control input-control--search"
          />
        </label>
        <button
          aria-label={t(locale, "search")}
          className="absolute right-1.5 top-1/2 inline-flex min-h-8 -translate-y-1/2 items-center rounded px-2.5 text-[13px] font-semibold text-brand transition-colors hover:bg-brand-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t(locale, "search")}
        </button>
      </form>

      {hasSearch ? (
        <p role="status" className="mt-2.5 text-[13px] font-normal text-slate">
          {locale === "es"
            ? `Mostrando ${resultLabel} para "${search.trim()}".`
            : `Showing ${resultLabel} for "${search.trim()}".`}{" "}
          <Link href="#search-results" className="action-link">
            {t(locale, "viewResults")}
          </Link>
        </p>
      ) : null}

      {/* Tied to the field with a rule so they read as its shortcuts, not as
          stray links sitting on the page. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule pt-3">
        <Link href="/decisions" className="action-link">
          {locale === "es" ? "Ver decisiones actuales" : "See current decisions"}
        </Link>
        {/* Hidden where the links stack, so the dot cannot be orphaned at the end
            of the first line. */}
        <span aria-hidden className="hidden text-[color:var(--rule-strong)] sm:inline">·</span>
        <Link href="/meetings" className="action-link">
          {t(locale, "viewMeetingCalendar")}
        </Link>
      </div>
    </div>
  );
}
