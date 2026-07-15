"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MeetingList } from "@/components/MeetingList";
import { MeetingsFilterForm } from "@/components/MeetingsFilterForm";
import { type Locale } from "@/lib/i18n";
import type { MeetingRow } from "@/lib/types";
import { matchesMeetingFilters } from "@/lib/utils/meetingFilters";
import type { MeetingView } from "@/lib/config/meetingView";

type StatusOption = {
  value: string;
  label: string;
};

export function MeetingsBrowser({
  meetings,
  initialSearch,
  initialStatus,
  view,
  month,
  date,
  jurisdiction,
  searchPlaceholder,
  statusLabel,
  statusOptions,
  locale
}: {
  meetings: MeetingRow[];
  initialSearch: string;
  initialStatus: string;
  view: MeetingView;
  month?: string;
  date?: string;
  jurisdiction?: string;
  searchPlaceholder: string;
  statusLabel: string;
  statusOptions: StatusOption[];
  locale: Locale;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const deferredSearch = useDeferredValue(search);
  const deferredStatus = useDeferredValue(status);
  const filteredMeetings = useMemo(
    () =>
      meetings.filter((meeting) =>
        matchesMeetingFilters(meeting, deferredSearch, deferredStatus, locale)
      ),
    [deferredSearch, deferredStatus, locale, meetings]
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const query = search.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (status) url.searchParams.set("status", status);
    else url.searchParams.delete("status");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [search, status]);

  useEffect(() => {
    function syncFromHistory() {
      const url = new URL(window.location.href);
      setSearch(url.searchParams.get("q") || "");
      setStatus(url.searchParams.get("status") || "");
    }

    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  return (
    <>
      <MeetingsFilterForm
        search={search}
        status={status}
        view={view}
        month={month}
        date={date}
        jurisdiction={jurisdiction}
        searchPlaceholder={searchPlaceholder}
        statusLabel={statusLabel}
        statusOptions={statusOptions}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
        locale={locale}
      />

      <MeetingList
        meetings={filteredMeetings}
        month={month}
        selectedDate={date}
        search={deferredSearch.trim()}
        view={view}
        locale={locale}
      />
    </>
  );
}
