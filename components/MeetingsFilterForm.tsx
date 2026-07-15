"use client";

import { SearchInput } from "@/components/DecisionSearchForm";
import { type Locale } from "@/lib/i18n";

export function MeetingsFilterForm({
  search,
  view,
  month,
  date,
  jurisdiction,
  searchPlaceholder,
  onSearchChange,
  locale
}: {
  search: string;
  view: "calendar" | "list";
  month?: string;
  date?: string;
  jurisdiction?: string;
  searchPlaceholder: string;
  onSearchChange: (search: string) => void;
  locale: Locale;
}) {
  return (
    <div className="quiet-card mb-6 p-4 sm:p-5" role="search">
      <input
        type="hidden"
        name="view"
        data-form-sync="view"
        defaultValue={view}
        disabled={view === "calendar"}
      />
      <input
        type="hidden"
        name="month"
        data-form-sync="month"
        defaultValue={month || ""}
        disabled={!month}
      />
      <input
        type="hidden"
        name="date"
        data-form-sync="date"
        defaultValue={date || ""}
        disabled={!date}
      />
      <input
        type="hidden"
        name="jurisdiction"
        defaultValue={jurisdiction || ""}
        disabled={!jurisdiction}
      />
      <SearchInput
        search={search}
        onSearchChange={onSearchChange}
        placeholder={searchPlaceholder}
        ariaLabel={searchPlaceholder.replace(/\.{3}$/u, "")}
        locale={locale}
      />
    </div>
  );
}
