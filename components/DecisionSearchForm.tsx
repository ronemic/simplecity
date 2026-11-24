"use client";

import { Search, X } from "lucide-react";
import { type Locale, t } from "@/lib/i18n";

export function SearchInput({
  search,
  onSearchChange,
  placeholder,
  ariaLabel,
  locale = "en",
  autoFocus = false
}: {
  search: string;
  onSearchChange: (search: string) => void;
  placeholder: string;
  ariaLabel: string;
  locale?: Locale;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/45"
      />
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        autoFocus={autoFocus}
        className="input-control input-control--search input-control--hero-search"
      />
      {search ? (
        <button
          type="button"
          onClick={() => onSearchChange("")}
          aria-label={t(locale, "clearSearch")}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-black/50 transition hover:bg-black/[0.05] hover:text-ink focus-visible:focus-ring"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function DecisionSearchForm({
  search = "",
  onSearchChange,
  placeholder,
  locale = "en",
  autoFocus = false
}: {
  search?: string;
  onSearchChange: (search: string) => void;
  placeholder?: string;
  locale?: Locale;
  /** Set when the reader just opened the search panel, never on page load. */
  autoFocus?: boolean;
}) {
  return (
    <div role="search">
      <SearchInput
        search={search}
        onSearchChange={onSearchChange}
        placeholder={placeholder || `${t(locale, "searchDecisions")}...`}
        ariaLabel={t(locale, "searchDecisions")}
        locale={locale}
        autoFocus={autoFocus}
      />
    </div>
  );
}
