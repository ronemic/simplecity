"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { type Locale, t } from "@/lib/i18n";

export function DecisionSearchForm({
  search = "",
  placeholder,
  locale = "en"
}: {
  search?: string;
  placeholder?: string;
  locale?: Locale;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(search);

  useEffect(() => {
    function syncFromHistory() {
      setValue(new URL(window.location.href).searchParams.get("q") || "");
    }

    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  useEffect(() => {
    const query = value.trim();
    if (query === search.trim()) return;

    function updateResults() {
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query);
      else params.delete("q");
      const nextQuery = params.toString();
      router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false });
    }

    if (!query) {
      updateResults();
      return;
    }

    const timer = window.setTimeout(updateResults, 300);
    return () => window.clearTimeout(timer);
  }, [pathname, router, search, searchParams, value]);

  return (
    <div className="quiet-card p-4 sm:p-5" role="search">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/45"
        />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder || `${t(locale, "searchDecisions")}...`}
        aria-label={t(locale, "searchDecisions")}
        autoComplete="off"
        className="input-control input-control--search"
      />
        {value ? (
          <button
            type="button"
            onClick={() => setValue("")}
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
