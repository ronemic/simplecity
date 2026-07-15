"use client";

import { SearchInput } from "@/components/DecisionSearchForm";
import { ListboxSelect } from "@/components/ListboxSelect";
import { type Locale } from "@/lib/i18n";

type StatusOption = {
  value: string;
  label: string;
};

export function MeetingsFilterForm({
  search,
  status,
  view,
  month,
  date,
  jurisdiction,
  searchPlaceholder,
  statusLabel,
  statusOptions,
  onSearchChange,
  onStatusChange,
  locale
}: {
  search: string;
  status: string;
  view: "calendar" | "list";
  month?: string;
  date?: string;
  jurisdiction?: string;
  searchPlaceholder: string;
  statusLabel: string;
  statusOptions: StatusOption[];
  onSearchChange: (search: string) => void;
  onStatusChange: (status: string) => void;
  locale: Locale;
}) {
  return (
    <div className="quiet-card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_180px] sm:p-5" role="search">
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
      <ListboxSelect
        key={status}
        name="status"
        label={statusLabel}
        value={status}
        options={statusOptions}
        onValueChange={onStatusChange}
      />
    </div>
  );
}
