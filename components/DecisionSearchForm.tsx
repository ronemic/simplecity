"use client";

import { Search, X } from "lucide-react";
import { type Locale, t } from "@/lib/i18n";

export function DecisionSearchForm({
  search = "",
  onSearchChange,
  placeholder,
  locale = "en"
}: {
  search?: string;
  onSearchChange: (search: string) => void;
  placeholder?: string;
  locale?: Locale;
}) {
  return (
    <div className="quiet-card p-4 sm:p-5" role="search">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/45"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder || `${t(locale, "searchDecisions")}...`}
          aria-label={t(locale, "searchDecisions")}
          autoComplete="off"
          className="input-control input-control--search"
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
    </div>
  );
}
