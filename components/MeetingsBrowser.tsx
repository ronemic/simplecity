"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MeetingList } from "@/components/MeetingList";
import { MeetingsFilterForm } from "@/components/MeetingsFilterForm";
import { type Locale } from "@/lib/i18n";
import type { MeetingRow } from "@/lib/types";
import { matchesMeetingFilters } from "@/lib/utils/meetingFilters";
import type { MeetingView } from "@/lib/config/meetingView";

export function MeetingsBrowser({
  meetings,
  initialSearch,
  view,
  month,
  date,
  jurisdiction,
  searchPlaceholder,
  locale
}: {
  meetings: MeetingRow[];
  initialSearch: string;
  view: MeetingView;
  month?: string;
  date?: string;
  jurisdiction?: string;
  searchPlaceholder: string;
  locale: Locale;
}) {
  const [search, setSearch] = useState(initialSearch);
  const deferredSearch = useDeferredValue(search);
  const filteredMeetings = useMemo(
    () => meetings.filter((meeting) => matchesMeetingFilters(meeting, deferredSearch, locale)),
    [deferredSearch, locale, meetings]
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const query = search.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    url.searchParams.delete("status");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [search]);

  useEffect(() => {
    function syncFromHistory() {
      const url = new URL(window.location.href);
      setSearch(url.searchParams.get("q") || "");
    }

    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  return (
    <>
      <MeetingsFilterForm
        search={search}
        view={view}
        month={month}
        date={date}
        jurisdiction={jurisdiction}
        searchPlaceholder={searchPlaceholder}
        onSearchChange={setSearch}
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
