"use client";

import { useState, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, FileText, List, Search } from "lucide-react";
import { AddToGoogleCalendarLink } from "@/components/AddToGoogleCalendarLink";
import { PendingLink } from "@/components/PendingLink";
import { StatusPill } from "@/components/StatusPill";
import { getJurisdictionDisplayLabel } from "@/lib/config/jurisdictions";
import type { MeetingRow } from "@/lib/types";
import {
  CIVIC_TIME_ZONE,
  formatDisplayDate,
  hasDisplayableMeetingTime,
  parseMeetingDate
} from "@/lib/utils/date";
import { displayMeetingTitle, displayMeetingType } from "@/lib/utils/meetingDisplay";
import { cn } from "@/lib/utils/cn";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MEETING_VIEW_STORAGE_KEY = "simplecity.meeting-list-view";

type MeetingCalendarProps = {
  meetings: MeetingRow[];
  month?: string;
  selectedDate?: string;
  view?: MeetingView;
};

type MeetingView = "calendar" | "list";

function jurisdictionLabel(meeting: MeetingRow) {
  return getJurisdictionDisplayLabel(meeting.jurisdiction_slug || meeting.jurisdiction_name);
}

function publicJurisdictionSlug(slug?: string | null) {
  return slug === "san-mateo-city" ? "san-mateo" : slug || "foster-city";
}

function dateKeyFromDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CIVIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function utcDateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateKeyFromUtcDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function addMonths(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidMonthKey(value?: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function isValidDateKey(value?: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function meetingStart(meeting: MeetingRow) {
  const value = meeting.meeting_datetime || parseMeetingDate(meeting.date_text);
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function meetingDateKey(meeting: MeetingRow) {
  const start = meetingStart(meeting);
  return start ? dateKeyFromDate(start) : null;
}

function meetingTimeLabel(meeting: MeetingRow) {
  const start = meetingStart(meeting);
  if (!start || !hasDisplayableMeetingTime(meeting.date_text, start.toISOString(), meeting.time_text)) {
    return "Time not listed";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: CIVIC_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit"
  }).format(start);
}

function meetingSortTime(meeting: MeetingRow) {
  return meetingStart(meeting)?.getTime() || Number.POSITIVE_INFINITY;
}

function formatDateKey(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CIVIC_TIME_ZONE,
    ...options
  }).format(utcDateFromKey(key));
}

function buildMonthDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1, 12));
  const firstGridDay = addDays(firstOfMonth, -firstOfMonth.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => dateKeyFromUtcDate(addDays(firstGridDay, index)));
}

function meetingHref(meeting: MeetingRow) {
  return `/meetings/${meeting.id}?jurisdiction=${publicJurisdictionSlug(meeting.jurisdiction_slug)}`;
}

function groupMeetingsByDate(meetings: MeetingRow[]) {
  const groups = new Map<string, MeetingRow[]>();

  for (const meeting of meetings) {
    const key = meetingDateKey(meeting) || "date-not-listed";
    groups.set(key, [...(groups.get(key) || []), meeting]);
  }

  for (const [key, rows] of groups) {
    groups.set(key, [...rows].sort((left, right) => meetingSortTime(left) - meetingSortTime(right)));
  }

  return groups;
}

function calendarMeetingTone(status?: string | null) {
  const normalized = status?.toLowerCase() || "";

  if (normalized.includes("cancel")) {
    return "border-[#f0c8bb] bg-[#fff7f3] text-[#7d321f] hover:border-[#dc9f8d] hover:bg-[#fff1eb]";
  }

  if (normalized.includes("upcoming")) {
    return "border-civic/20 bg-[#f3f7ff] text-[#12365f] hover:border-civic/35 hover:bg-[#eaf2ff]";
  }

  return "border-black/10 bg-white/90 text-ink hover:border-civic/25 hover:bg-[#f7fbff]";
}

function MeetingLine({ meeting, compact = false }: { meeting: MeetingRow; compact?: boolean }) {
  return (
    <div
      className={cn(
        "grid gap-2",
        compact ? "sm:grid-cols-[4.25rem_1fr] sm:items-start" : "sm:grid-cols-[7rem_1fr_auto] sm:items-center"
      )}
    >
      <div className="flex items-center gap-1.5 text-sm font-black text-[#12365f]">
        <Clock aria-hidden className="h-3.5 w-3.5" />
        <span>{meetingTimeLabel(meeting)}</span>
      </div>
      <div className="min-w-0">
        <PendingLink
          href={meetingHref(meeting)}
          className={cn(
            "block w-full font-black text-ink transition hover:text-civic focus-visible:focus-ring",
            compact ? "line-clamp-3 text-sm leading-5" : "line-clamp-2 text-lg leading-snug sm:text-[1.05rem]"
          )}
          contentClassName={cn(
            compact ? "!flex !w-full !flex-col !items-start !gap-0.5" : "items-center",
            "transition-opacity"
          )}
          pendingLabel="Opening meeting"
        >
          {displayMeetingTitle(meeting)}
        </PendingLink>
        <p className="mt-0.5 text-xs font-semibold leading-5 text-black/55">
          {displayMeetingType(meeting)} · {jurisdictionLabel(meeting)}
        </p>
      </div>
      {!compact ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <AddToGoogleCalendarLink meeting={meeting} compact className="min-h-9 px-3 py-2" />
        </div>
      ) : null}
    </div>
  );
}

export function MeetingList({
  meetings,
  month,
  selectedDate,
  view = "calendar"
}: MeetingCalendarProps) {
  const todayKey = dateKeyFromDate(new Date());

  const [activeView, setActiveView] = useState<MeetingView>(view);
  const [activeMonth, setActiveMonth] = useState<string>(() =>
    isValidMonthKey(month) ? month : todayKey.slice(0, 7)
  );
  const [activeDate, setActiveDate] = useState<string>(() => {
    const initialMonth = isValidMonthKey(month) ? month : todayKey.slice(0, 7);
    return isValidDateKey(selectedDate) && selectedDate.startsWith(initialMonth)
      ? selectedDate
      : todayKey.startsWith(initialMonth)
      ? todayKey
        : `${initialMonth}-01`;
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("view")) return;

    try {
      const storedView = window.localStorage.getItem(MEETING_VIEW_STORAGE_KEY);
      if (storedView === "calendar" || storedView === "list") {
        const frame = window.requestAnimationFrame(() => {
          setActiveView(storedView);
        });

        return () => window.cancelAnimationFrame(frame);
      }
    } catch {
      // Ignore storage failures and fall back to the server-rendered default.
    }
  }, []);

  // Sync form input helper
  const syncFormInput = (name: string, value: string) => {
    const input = document.querySelector(`input[data-form-sync="${name}"]`) as HTMLInputElement | null;
    if (input) {
      input.value = value;
      if (name === "view") {
        input.disabled = value === "calendar";
      } else if (name === "month" || name === "date") {
        input.disabled = !value;
      }
    }
  };

  const updateUrlParams = (params: { view?: string; month?: string; date?: string }) => {
    const url = new URL(window.location.href);

    if (params.view !== undefined) {
      if (params.view === "calendar") {
        url.searchParams.delete("view");
      } else {
        url.searchParams.set("view", params.view);
      }
      syncFormInput("view", params.view);
    }

    if (params.month !== undefined) {
      if (!params.month) {
        url.searchParams.delete("month");
      } else {
        url.searchParams.set("month", params.month);
      }
      syncFormInput("month", params.month);
    }

    if (params.date !== undefined) {
      if (!params.date) {
        url.searchParams.delete("date");
      } else {
        url.searchParams.set("date", params.date);
      }
      syncFormInput("date", params.date);
    }

    window.history.pushState(null, "", url.pathname + url.search);
  };

  // Listen to popstate event (browser Back/Forward buttons)
  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      const urlView = params.get("view") === "list" ? "list" : "calendar";
      const urlMonth = params.get("month") || "";
      const urlDate = params.get("date") || "";

      setActiveView(urlView);
      if (isValidMonthKey(urlMonth)) {
        setActiveMonth(urlMonth);
      } else {
        setActiveMonth(todayKey.slice(0, 7));
      }

      if (isValidDateKey(urlDate)) {
        setActiveDate(urlDate);
      } else {
        const fallbackMonth = isValidMonthKey(urlMonth) ? urlMonth : todayKey.slice(0, 7);
        setActiveDate(todayKey.startsWith(fallbackMonth) ? todayKey : `${fallbackMonth}-01`);
      }

      // Sync form inputs
      syncFormInput("view", urlView);
      syncFormInput("month", urlMonth);
      syncFormInput("date", urlDate);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [todayKey]);

  const handleViewChange = (newView: MeetingView) => {
    setActiveView(newView);
    updateUrlParams({ view: newView });

    try {
      window.localStorage.setItem(MEETING_VIEW_STORAGE_KEY, newView);
    } catch {
      // Ignore storage failures so the toggle still works normally.
    }
  };

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    const newMonth = addMonths(activeMonth, -1);
    setActiveMonth(newMonth);
    const newDate = todayKey.startsWith(newMonth) ? todayKey : `${newMonth}-01`;
    setActiveDate(newDate);
    updateUrlParams({ month: newMonth, date: newDate });
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    const newMonth = addMonths(activeMonth, 1);
    setActiveMonth(newMonth);
    const newDate = todayKey.startsWith(newMonth) ? todayKey : `${newMonth}-01`;
    setActiveDate(newDate);
    updateUrlParams({ month: newMonth, date: newDate });
  };

  const handleToday = (e: React.MouseEvent) => {
    e.preventDefault();
    const newMonth = todayKey.slice(0, 7);
    setActiveMonth(newMonth);
    setActiveDate(todayKey);
    updateUrlParams({ month: newMonth, date: todayKey });
  };

  const handleDateClick = (e: React.MouseEvent, day: string) => {
    e.preventDefault();
    const newMonth = day.slice(0, 7);
    setActiveMonth(newMonth);
    setActiveDate(day);
    updateUrlParams({ month: newMonth, date: day });
  };

  const monthDays = buildMonthDays(activeMonth);
  const meetingsByDate = groupMeetingsByDate(meetings);
  const sortedMeetings = [...meetings].sort((left, right) => {
    const leftTime = meetingSortTime(left);
    const rightTime = meetingSortTime(right);
    if (leftTime === Number.POSITIVE_INFINITY && rightTime === Number.POSITIVE_INFINITY) return 0;
    if (leftTime === Number.POSITIVE_INFINITY) return 1;
    if (rightTime === Number.POSITIVE_INFINITY) return -1;
    return rightTime - leftTime;
  });
  const activeDateMeetings = meetingsByDate.get(activeDate) || [];
  const monthMeetingCount = monthDays
    .filter((day) => day.startsWith(activeMonth))
    .reduce((sum, day) => sum + (meetingsByDate.get(day)?.length || 0), 0);
  const activeMonthLabel = formatDateKey(`${activeMonth}-01`, {
    month: "long",
    year: "numeric"
  });

  return (
    <div className="grid gap-6">
      <div className="hidden md:flex justify-end">
        <div className="inline-flex rounded-lg border border-black/10 bg-white p-1 shadow-[0_1px_2px_rgba(23,23,23,0.04)]">
          {(["calendar", "list"] as MeetingView[]).map((option) => {
            const selected = activeView === option;

            return (
              <button
                key={option}
                type="button"
                onClick={() => handleViewChange(option)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-black capitalize transition focus-visible:focus-ring",
                  selected ? "bg-civic text-white shadow-sm" : "text-black/65 hover:bg-black/[0.04] hover:text-ink"
                )}
              >
                {option === "calendar" ? (
                  <CalendarDays aria-hidden className="h-4 w-4" />
                ) : (
                  <List aria-hidden className="h-4 w-4" />
                )}
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {meetings.length === 0 ? (
        <div className="quiet-card p-8 text-center">
          <FileText aria-hidden className="mx-auto h-10 w-10 text-black/40" />
          <h2 className="mt-3 text-xl font-bold text-ink">No meetings match those filters</h2>
          <p className="mt-2 text-sm leading-6 text-black/70">
            Try a broader search, a different status, or another jurisdiction.
          </p>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start",
              activeView !== "calendar" && "md:hidden"
            )}
          >
            <section className="hidden quiet-card overflow-hidden md:block">
              <div className="grid gap-4 border-b border-black/10 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start sm:p-5">
                <div>
                  <p className="label-eyebrow text-civic">Month view</p>
                  <h2 className="mt-1 text-2xl font-black text-ink">{activeMonthLabel}</h2>
                  <p className="mt-1 text-sm font-semibold text-black/60">
                    {monthMeetingCount} meetings shown this month.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 md:flex-nowrap">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-black/15 px-3 py-2 text-sm font-bold text-ink transition hover:bg-black/[0.035] focus-visible:focus-ring"
                  >
                    <ChevronLeft aria-hidden className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={handleToday}
                    className="inline-flex min-h-10 items-center rounded-md border border-civic/20 bg-[#eef5ff] px-3 py-2 text-sm font-black text-civic transition hover:bg-[#e0edff] focus-visible:focus-ring"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-black/15 px-3 py-2 text-sm font-bold text-ink transition hover:bg-black/[0.035] focus-visible:focus-ring"
                  >
                    Next
                    <ChevronRight aria-hidden className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-7 border-b border-black/10 bg-[#f4f7f9]">
                    {WEEKDAYS.map((day) => (
                      <div key={day} className="px-3 py-2.5 text-center text-xs font-black uppercase text-black/55">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid auto-rows-[minmax(150px,auto)] grid-cols-7 bg-[#edf2f5]">
                    {monthDays.map((day) => {
                      const dayMeetings = meetingsByDate.get(day) || [];
                      const inMonth = day.startsWith(activeMonth);
                      const isSelected = day === activeDate;

                      return (
                        <div
                          key={day}
                          className={cn(
                            "relative flex min-h-0 flex-col border-b border-r border-black/10 bg-white p-2 transition",
                            inMonth ? "hover:bg-[#f9fbfd]" : "bg-[#f7f8f9] text-black/35",
                            isSelected && "z-10 shadow-[inset_0_0_0_2px_#2f65e8]"
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleDateClick(e, day)}
                              className={cn(
                                "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-sm font-black leading-none transition hover:bg-civic/10 focus-visible:focus-ring",
                                isSelected ? "bg-civic text-white hover:bg-civic" : inMonth ? "text-ink" : "text-black/40"
                              )}
                            >
                              {Number(day.slice(-2))}
                            </button>
                          </div>
                          <div className="mt-2 grid flex-1 content-start gap-1.5">
                            {dayMeetings.map((meeting) => (
                              <PendingLink
                                key={meeting.id}
                                href={meetingHref(meeting)}
                                className={cn(
                                  "block rounded-md border px-2 py-1.5 text-left text-[10px] font-bold leading-4 shadow-[0_1px_1px_rgba(23,23,23,0.03)] transition focus-visible:focus-ring",
                                  calendarMeetingTone(meeting.status)
                                )}
                                contentClassName="!flex !w-full !min-w-0 !flex-col !items-start !gap-0"
                                pendingLabel="Opening meeting"
                              >
                                <span className="block w-full text-[10px] font-black leading-4 text-current opacity-80">
                                  {meetingTimeLabel(meeting)}
                                </span>
                                <span className="block w-full whitespace-normal break-words text-[11px] leading-4">
                                  {displayMeetingTitle(meeting)}
                                </span>
                              </PendingLink>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            <aside className="quiet-card overflow-hidden">
              <div className="border-b border-black/10 p-4">
                <p className="label-eyebrow text-civic">Day view</p>
                <h2 className="mt-1 text-2xl font-black text-ink">
                  {formatDateKey(activeDate, {
                    weekday: "long",
                    month: "short",
                    day: "numeric"
                  })}
                </h2>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  {activeDateMeetings.length === 1
                    ? "1 meeting listed."
                    : `${activeDateMeetings.length} meetings listed.`}
                </p>
              </div>
              <div className="divide-y divide-black/10">
                {activeDateMeetings.length > 0 ? (
                  activeDateMeetings.map((meeting) => (
                    <div key={meeting.id} className="p-3.5">
                      <MeetingLine meeting={meeting} compact />
                    </div>
                  ))
                ) : (
                  <div className="p-4">
                    <p className="text-sm font-semibold leading-6 text-black/70">
                      No meetings are listed for this day with the current filters.
                    </p>
                  </div>
                )}
              </div>
            </aside>
          </div>

          <section
            className={cn(
              "quiet-card overflow-hidden",
              activeView !== "list" && "md:hidden"
            )}
          >
            <div className="flex flex-col gap-3 border-b border-black/10 p-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="label-eyebrow text-civic">All matching meetings</p>
                <h2 className="mt-1 text-2xl font-black text-ink">
                  {meetings.length === 1 ? "1 meeting" : `${meetings.length} meetings`}
                </h2>
              </div>
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-black/60">
                <Search aria-hidden className="h-4 w-4" />
                Search and status filters apply to this list.
              </p>
            </div>
            <div className="divide-y divide-black/10">
              {sortedMeetings.map((meeting) => (
                <article key={meeting.id} className="grid gap-2 p-5 transition hover:bg-black/[0.025] sm:p-6">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-black/65">
                    <StatusPill status={meeting.status} />
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays aria-hidden className="h-4 w-4 text-[#42677f]" />
                      {formatDisplayDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)}
                    </span>
                  </div>
                  <MeetingLine meeting={meeting} />
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
