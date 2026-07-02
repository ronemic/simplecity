"use client";

import { useState, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, FileText, List, Search } from "lucide-react";
import { AddToGoogleCalendarLink } from "@/components/AddToGoogleCalendarLink";
import { HighlightedText } from "@/components/HighlightedText";
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
import {
  addMonths,
  buildMonthDays,
  dateKeyFromDate,
  firstDateInMonth,
  formatDateKey,
  isValidMonthKey,
  weekdays
} from "@/lib/utils/calendarGrid";
import { displayMeetingTitle, displayMeetingType } from "@/lib/utils/meetingDisplay";
import { cn } from "@/lib/utils/cn";
import { type Locale, t } from "@/lib/i18n";

const MEETING_VIEW_STORAGE_KEY = "simplecity.meeting-list-view";

type MeetingCalendarProps = {
  meetings: MeetingRow[];
  month?: string;
  selectedDate?: string;
  search?: string;
  view?: MeetingView;
  locale?: Locale;
};

type MeetingView = "calendar" | "list";

function jurisdictionLabel(meeting: MeetingRow) {
  return getJurisdictionDisplayLabel(meeting.jurisdiction_slug || meeting.jurisdiction_name);
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

function meetingTimeLabel(meeting: MeetingRow, locale: Locale) {
  const start = meetingStart(meeting);
  if (!start || !hasDisplayableMeetingTime(meeting.date_text, start.toISOString(), meeting.time_text)) {
    return t(locale, "timeNotListed");
  }

  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: CIVIC_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit"
  }).format(start);
}

function meetingSortTime(meeting: MeetingRow) {
  return meetingStart(meeting)?.getTime() || Number.POSITIVE_INFINITY;
}

function meetingHref(meeting: MeetingRow) {
  const jurisdiction =
    meeting.jurisdiction_slug === "san-mateo-city"
      ? "san-mateo"
      : meeting.jurisdiction_slug;

  return `/meetings/${meeting.id}${jurisdiction ? `?jurisdiction=${jurisdiction}` : ""}`;
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

function MeetingLine({
  meeting,
  compact = false,
  highlight,
  locale
}: {
  meeting: MeetingRow;
  compact?: boolean;
  highlight?: string;
  locale: Locale;
}) {
  const meetingTitleFallback = locale === "es" ? "Reunión no indicada" : "Meeting not listed";
  const meetingType = displayMeetingType(meeting, t(locale, "meetingTypeNotListed"), locale);
  const meetingJurisdiction = jurisdictionLabel(meeting);

  return (
    <div
      className={cn(
        "grid gap-2",
        compact ? "sm:grid-cols-[4.25rem_1fr] sm:items-start" : "sm:grid-cols-[7rem_1fr_auto] sm:items-center"
      )}
    >
      <div className="flex items-center gap-1.5 text-sm font-black text-[#12365f]">
        <Clock aria-hidden className="h-3.5 w-3.5" />
        <span>{meetingTimeLabel(meeting, locale)}</span>
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
          pendingLabel={t(locale, "openingMeeting")}
        >
          <HighlightedText text={displayMeetingTitle(meeting, meetingTitleFallback, locale)} query={highlight} />
        </PendingLink>
        <p className="mt-0.5 text-xs font-semibold leading-5 text-black/55">
          <HighlightedText text={meetingType} query={highlight} />
          {" · "}
          <HighlightedText text={meetingJurisdiction} query={highlight} />
        </p>
      </div>
      {!compact ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <AddToGoogleCalendarLink meeting={meeting} compact className="min-h-9 px-3 py-2" locale={locale} />
        </div>
      ) : null}
    </div>
  );
}

export function MeetingList({
  meetings,
  month,
  selectedDate,
  search = "",
  view = "calendar",
  locale = "en"
}: MeetingCalendarProps) {
  const highlight = search.trim();
  const todayKey = dateKeyFromDate(new Date());

  const [activeView, setActiveView] = useState<MeetingView>(view);
  const [activeMonth, setActiveMonth] = useState<string>(() =>
    isValidMonthKey(month) ? month : todayKey.slice(0, 7)
  );
  const [activeDate, setActiveDate] = useState<string>(() => {
    const initialMonth = isValidMonthKey(month) ? month : todayKey.slice(0, 7);
    return firstDateInMonth(initialMonth, selectedDate, todayKey);
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

      const fallbackMonth = isValidMonthKey(urlMonth) ? urlMonth : todayKey.slice(0, 7);
      setActiveDate(firstDateInMonth(fallbackMonth, urlDate, todayKey));

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
    const newDate = firstDateInMonth(newMonth, activeDate, todayKey);
    setActiveDate(newDate);
    updateUrlParams({ month: newMonth, date: newDate });
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    const newMonth = addMonths(activeMonth, 1);
    setActiveMonth(newMonth);
    const newDate = firstDateInMonth(newMonth, activeDate, todayKey);
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
    if (!day.startsWith(activeMonth)) return;
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
  }, locale);
  const weekdayLabels = weekdays(locale);

  return (
    <div className="grid gap-6">
      <div className="hidden md:flex justify-end">
        <div className="segmented-control">
          {(["calendar", "list"] as MeetingView[]).map((option) => {
            const selected = activeView === option;

            return (
              <button
                key={option}
                type="button"
                onClick={() => handleViewChange(option)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "segmented-button",
                  selected && "segmented-button-selected"
                )}
              >
                {option === "calendar" ? (
                  <CalendarDays aria-hidden className="h-4 w-4" />
                ) : (
                  <List aria-hidden className="h-4 w-4" />
                )}
                {t(locale, option)}
              </button>
            );
          })}
        </div>
      </div>

      {meetings.length === 0 ? (
        <div className="quiet-card p-8 text-center">
          <FileText aria-hidden className="mx-auto h-10 w-10 text-black/40" />
          <h2 className="mt-3 text-xl font-bold text-ink">{t(locale, "noMatchingMeetings")}</h2>
          <p className="mt-2 text-sm leading-6 text-black/70">
            {t(locale, "tryBroaderMeetingSearch")}
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
                  <p className="label-eyebrow text-civic">{t(locale, "monthView")}</p>
                  <h2 className="mt-1 text-2xl font-black text-ink">{activeMonthLabel}</h2>
                  <p className="mt-1 text-sm font-semibold text-black/60">
                    {locale === "es"
                      ? `${monthMeetingCount} reuniones mostradas este mes.`
                      : `${monthMeetingCount} meetings shown this month.`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 md:flex-nowrap">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="action-secondary-sm"
                  >
                    <ChevronLeft aria-hidden className="h-4 w-4" />
                    {t(locale, "previous")}
                  </button>
                  <button
                    type="button"
                    onClick={handleToday}
                    className="action-civic-sm"
                  >
                    {t(locale, "today")}
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="action-secondary-sm"
                  >
                    {t(locale, "next")}
                    <ChevronRight aria-hidden className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-7 border-b border-black/10 bg-[#f4f7f9]">
                    {weekdayLabels.map((day) => (
                      <div key={day} className="px-3 py-2.5 text-center text-xs font-black uppercase text-black/55">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid auto-rows-[minmax(150px,auto)] grid-cols-7 bg-[#edf2f5]">
                    {monthDays.map((day) => {
                      const inMonth = day.startsWith(activeMonth);
                      const dayMeetings = inMonth ? meetingsByDate.get(day) || [] : [];
                      const isSelected = inMonth && day === activeDate;
                      const isToday = inMonth && day === todayKey;

                      return (
                        <div
                          key={day}
                          className={cn(
                            "relative flex min-h-0 flex-col border-b border-r border-black/10 bg-white p-2 transition",
                            inMonth ? "hover:bg-[#f9fbfd]" : "bg-[#eef1f4] text-black/25",
                            isSelected && "z-10 shadow-[inset_0_0_0_2px_#2f65e8]"
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleDateClick(e, day)}
                              disabled={!inMonth}
                              aria-current={isToday ? "date" : undefined}
                              aria-pressed={isSelected}
                              className={cn(
                                "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-sm font-black leading-none transition hover:bg-civic/10 focus-visible:focus-ring",
                                isSelected || isToday
                                  ? "bg-civic text-white hover:bg-civic"
                                  : inMonth
                                    ? "text-ink"
                                    : "cursor-default text-black/25 hover:bg-transparent"
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
                                mode="overlay"
                                className={cn(
                                  "block rounded-md border px-2 py-1.5 text-left text-[10px] font-bold leading-4 shadow-[0_1px_1px_rgba(23,23,23,0.03)] transition focus-visible:focus-ring",
                                  calendarMeetingTone(meeting.status)
                                )}
                                contentClassName="!flex !w-full !min-w-0 !flex-col !items-start !gap-0"
                                pendingLabel={t(locale, "openingMeeting")}
                              >
                                <span className="block w-full text-[10px] font-black leading-4 text-current opacity-80">
                                  {meetingTimeLabel(meeting, locale)}
                                </span>
                                <span className="block w-full whitespace-normal break-words text-[11px] leading-4">
                                  <HighlightedText
                                    text={displayMeetingTitle(
                                      meeting,
                                      locale === "es" ? "Reunión no indicada" : "Meeting not listed",
                                      locale
                                    )}
                                    query={highlight}
                                  />
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
                <p className="label-eyebrow text-civic">{t(locale, "dayView")}</p>
                <h2 className="mt-1 text-2xl font-black text-ink">
                  {activeDate
                    ? formatDateKey(activeDate, {
                        weekday: "long",
                        month: "short",
                        day: "numeric"
                      }, locale)
                    : t(locale, "selectADay")}
                </h2>
                <p className="mt-1 text-sm font-semibold text-black/60">
                  {activeDateMeetings.length === 1
                    ? locale === "es"
                      ? "1 reunión indicada."
                      : "1 meeting listed."
                    : locale === "es"
                      ? `${activeDateMeetings.length} reuniones indicadas.`
                      : `${activeDateMeetings.length} meetings listed.`}
                </p>
              </div>
              <div className="divide-y divide-black/10">
                {activeDateMeetings.length > 0 ? (
                  activeDateMeetings.map((meeting) => (
                    <div key={meeting.id} className="p-3.5">
                      <MeetingLine meeting={meeting} compact highlight={highlight} locale={locale} />
                    </div>
                  ))
                ) : (
                  <div className="p-4">
                    <p className="text-sm font-semibold leading-6 text-black/70">
                      {t(locale, "noMeetingsForDay")}
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
                <p className="label-eyebrow text-civic">{t(locale, "allMatchingMeetings")}</p>
                <h2 className="mt-1 text-2xl font-black text-ink">
                  {meetings.length === 1
                    ? locale === "es"
                      ? "1 reunión"
                      : "1 meeting"
                    : locale === "es"
                      ? `${meetings.length} reuniones`
                      : `${meetings.length} meetings`}
                </h2>
              </div>
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-black/60">
                <Search aria-hidden className="h-4 w-4" />
                {locale === "es"
                  ? "La búsqueda y los filtros de estado se aplican a esta lista."
                  : "Search and status filters apply to this list."}
              </p>
            </div>
            <div className="divide-y divide-black/10">
              {sortedMeetings.map((meeting) => (
                <article key={meeting.id} className="grid gap-2 p-5 transition hover:bg-black/[0.025] sm:p-6">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-black/65">
                    <StatusPill status={meeting.status} locale={locale} highlight={highlight} />
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays aria-hidden className="h-4 w-4 text-[#42677f]" />
                      <HighlightedText
                        text={formatDisplayDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)}
                        query={highlight}
                      />
                    </span>
                  </div>
                  <MeetingLine meeting={meeting} highlight={highlight} locale={locale} />
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
