"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, FileText, List, Search } from "lucide-react";
import { AddToGoogleCalendarLink } from "@/components/AddToGoogleCalendarLink";
import { DateStack } from "@/components/DateStack";
import { HighlightedText } from "@/components/HighlightedText";
import { PendingLink } from "@/components/PendingLink";
import { getJurisdictionDisplayLabel } from "@/lib/config/jurisdictions";
import type { MeetingRow } from "@/lib/types";
import {
  CIVIC_TIME_ZONE,
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
import { meetingSearchMatch } from "@/lib/utils/meetingFilters";
import { matchesNormalizedDecisionSearchText } from "@/lib/utils/decisionFilters";
import { cn } from "@/lib/utils/cn";
import { type Locale, statusLabel, t } from "@/lib/i18n";
import {
  MEETING_VIEW_PREFERENCE_COOKIE,
  MEETING_VIEW_STORAGE_KEY,
  type MeetingView
} from "@/lib/config/meetingView";
import { isSantaBarbaraPlanningMeeting } from "@/lib/utils/santaBarbaraBody";

type MeetingCalendarProps = {
  meetings: MeetingRow[];
  month?: string;
  selectedDate?: string;
  search?: string;
  view?: MeetingView;
  locale?: Locale;
};

/**
 * The list view renders into the document even while the calendar is showing --
 * it is only hidden with a CSS class -- so every meeting ever scraped was landing
 * in the HTML. Across all jurisdictions that made /meetings a 4.4MB response.
 *
 * Rendering a page at a time fixes the payload without weakening the feature:
 * search and the calendar still work against the full set held in memory, and the
 * count in the heading still reports every match.
 */
const LIST_PAGE_SIZE = 60;

// A day cell shows this many meetings outright; a busier day shows one fewer and
// a "+N more" control in its place, so every week row keeps the same height.
const CALENDAR_MAX_VISIBLE_MEETINGS = 3;

function writeMeetingViewPreference(view: MeetingView) {
  document.cookie = `${MEETING_VIEW_PREFERENCE_COOKIE}=${view}; path=/; max-age=31536000; samesite=lax`;
}

function jurisdictionLabel(meeting: MeetingRow, locale: Locale = "en") {
  return getJurisdictionDisplayLabel(
    meeting.jurisdiction_slug || meeting.jurisdiction_name,
    locale
  );
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

function searchMatchesMeetingTime(meeting: MeetingRow, search: string, locale: Locale) {
  return Boolean(
    search && matchesNormalizedDecisionSearchText(meetingTimeLabel(meeting, locale), search)
  );
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

type MeetingTone = "upcoming" | "cancelled" | "past";

function meetingTone(status?: string | null): MeetingTone {
  const normalized = status?.toLowerCase() || "";
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("upcoming")) return "upcoming";
  return "past";
}

const CALENDAR_EVENT_TONES: Record<MeetingTone, string> = {
  upcoming: "bg-[#e9f0fb] text-[#163a66] hover:bg-[#dde8f8]",
  cancelled: "bg-[#f6f1ef] text-black/45 hover:bg-[#f0e8e5]",
  past: "bg-[#f2f4f6] text-black/60 hover:bg-[#e9edf0] hover:text-ink"
};

const TONE_DOTS: Record<MeetingTone, string> = {
  upcoming: "bg-civic",
  cancelled: "bg-[#d9907c]",
  past: "bg-black/25"
};

function calendarMeetingTitle(meeting: MeetingRow, locale: Locale) {
  return displayMeetingTitle(
    meeting,
    locale === "es" ? "Reunión no indicada" : "Meeting not listed",
    locale
  );
}

function visibleCalendarMeetings(meetings: MeetingRow[]) {
  const visibleCount =
    meetings.length > CALENDAR_MAX_VISIBLE_MEETINGS
      ? CALENDAR_MAX_VISIBLE_MEETINGS - 1
      : meetings.length;

  return {
    visibleMeetings: meetings.slice(0, visibleCount),
    overflowCount: meetings.length - visibleCount
  };
}

function CalendarMeetingLink({
  meeting,
  highlight,
  locale,
  expanded = false
}: {
  meeting: MeetingRow;
  highlight: string;
  locale: Locale;
  expanded?: boolean;
}) {
  const tone = meetingTone(meeting.status);
  const searchMatch = meetingSearchMatch(meeting, highlight, locale);
  const timeMatchIsVisible = searchMatchesMeetingTime(meeting, highlight, locale);
  const hasTime = meetingTimeLabel(meeting, locale) !== t(locale, "timeNotListed");

  return (
    <PendingLink
      href={meetingHref(meeting)}
      mode="overlay"
      className={cn(
        "pointer-events-auto relative z-20 block w-full shrink-0 !overflow-visible rounded-md px-2 py-1.5 text-left transition-colors focus-visible:focus-ring",
        CALENDAR_EVENT_TONES[tone]
      )}
      contentClassName="!flex !w-full !min-w-0 !items-start !gap-0"
      pendingLabel={t(locale, "openingMeeting")}
      title={calendarMeetingTitle(meeting, locale)}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[10.5px] font-medium leading-4 tabular-nums opacity-75">
          <span aria-hidden className={cn("h-1.5 w-1.5 flex-none rounded-full", TONE_DOTS[tone])} />
          <span className="truncate">
            {tone === "cancelled" ? <span className="sr-only">{statusLabel(locale, "Cancelled")}: </span> : null}
            {hasTime ? (
              <HighlightedText text={meetingTimeLabel(meeting, locale)} query={highlight} />
            ) : (
              t(locale, "timeNotListed")
            )}
          </span>
        </span>
        <span
          lang={locale}
          className={cn(
            "mt-0.5 hyphens-auto break-words text-[11.5px] font-semibold leading-[15px]",
            expanded ? "block" : "line-clamp-2",
            tone === "cancelled" && "line-through decoration-black/25"
          )}
        >
          <HighlightedText text={calendarMeetingTitle(meeting, locale)} query={highlight} />
        </span>
        {searchMatch && searchMatch.field !== "title" && !timeMatchIsVisible ? (
          <span className="line-clamp-1 block text-[10px] font-semibold leading-4 opacity-70">
            <HighlightedText text={searchMatch.text} query={highlight} />
          </span>
        ) : null}
      </span>
    </PendingLink>
  );
}

function MeetingStatusLabel({
  status,
  highlight,
  locale
}: {
  status?: string | null;
  highlight?: string;
  locale: Locale;
}) {
  const tone = meetingTone(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-bold",
        tone === "upcoming" ? "text-[#164a91]" : tone === "cancelled" ? "text-[#9f2a20]" : "text-black/50"
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", TONE_DOTS[tone])} />
      <HighlightedText text={statusLabel(locale, status || "Unknown")} query={highlight} />
    </span>
  );
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
  const meetingJurisdiction = jurisdictionLabel(meeting, locale);
  const advisory = isSantaBarbaraPlanningMeeting(meeting);
  const cancelled = meetingTone(meeting.status) === "cancelled";
  const timeLabel = meetingTimeLabel(meeting, locale);
  const hasTime = timeLabel !== t(locale, "timeNotListed");
  const searchMatch = meetingSearchMatch(meeting, highlight || "", locale);
  const timeMatchIsVisible = searchMatchesMeetingTime(meeting, highlight || "", locale);
  const showCompactSearchMatch =
    compact &&
    searchMatch &&
    !timeMatchIsVisible &&
    searchMatch.field === "date";

  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-1",
        compact ? "grid-cols-[4.5rem_1fr] items-baseline" : "sm:grid-cols-[6rem_1fr_auto] sm:items-center"
      )}
    >
      <div
        className={cn(
          "text-sm tabular-nums leading-6",
          hasTime ? "font-black text-[#12365f]" : "font-semibold italic text-black/45",
          cancelled && "text-black/40"
        )}
      >
        <HighlightedText text={timeLabel} query={highlight} />
      </div>
      <div className="min-w-0">
        <PendingLink
          href={meetingHref(meeting)}
          className={cn(
            "block w-full font-black text-ink transition hover:text-civic focus-visible:focus-ring",
            compact ? "line-clamp-3 text-sm leading-5" : "line-clamp-2 text-base leading-snug sm:text-[1.05rem]",
            cancelled && "text-black/55"
          )}
          contentClassName={cn(
            compact ? "!flex !w-full !flex-col !items-start !gap-0.5" : "items-center",
            "transition-opacity"
          )}
          pendingLabel={t(locale, "openingMeeting")}
        >
          <HighlightedText text={displayMeetingTitle(meeting, meetingTitleFallback, locale)} query={highlight} />
        </PendingLink>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold leading-5 text-black/55">
          {!compact ? (
            <>
              <MeetingStatusLabel status={meeting.status} highlight={highlight} locale={locale} />
              <span aria-hidden className="text-black/25">·</span>
            </>
          ) : null}
          <HighlightedText text={meetingType} query={highlight} />
          <span aria-hidden className="text-black/25">·</span>
          <HighlightedText text={meetingJurisdiction} query={highlight} />
          {advisory ? (
            <span className="rounded-full border border-[#b8a06a] bg-[#fff8e7] px-1.5 py-0.5 text-[0.62rem] font-black uppercase tracking-[0.05em] text-[#765514]">
              {locale === "es" ? "Asesora" : "Advisory"}
            </span>
          ) : null}
        </p>
        {showCompactSearchMatch ? (
          <p className="mt-0.5 text-xs font-bold leading-5 text-civic">
            <HighlightedText text={searchMatch.text} query={highlight} />
          </p>
        ) : null}
      </div>
      {!compact ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:justify-end">
          <AddToGoogleCalendarLink meeting={meeting} compact className="min-h-9 px-3 py-2" locale={locale} />
        </div>
      ) : null}
    </div>
  );
}

type ListDateGroup = { key: string; meetings: MeetingRow[] };

// The list is already sorted newest first; this keeps that order across days while
// reading each day's meetings in the order they happen.
function groupListMeetingsByDay(meetings: MeetingRow[]) {
  const groups: ListDateGroup[] = [];

  for (const meeting of meetings) {
    const key = meetingDateKey(meeting) || "date-not-listed";
    const last = groups[groups.length - 1];
    if (last?.key === key) last.meetings.push(meeting);
    else groups.push({ key, meetings: [meeting] });
  }

  for (const group of groups) {
    group.meetings.sort((left, right) => meetingSortTime(left) - meetingSortTime(right));
  }

  return groups;
}

function ListDateBadge({ dateKey, todayKey, locale }: { dateKey: string; todayKey: string; locale: Locale }) {
  if (dateKey === "date-not-listed") {
    return (
      <div className="w-14 text-xs font-semibold leading-tight text-black/45">
        {t(locale, "dateNotListed")}
      </div>
    );
  }

  return (
    <DateStack
      month={formatDateKey(dateKey, { month: "short" }, locale).replace(".", "")}
      day={Number(dateKey.slice(-2))}
      weekday={formatDateKey(dateKey, { weekday: "short" }, locale).replace(".", "")}
      tone={dateKey === todayKey ? "today" : "default"}
      dateTime={dateKey}
    />
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
  const [listPaging, setListPaging] = useState({ search: "", pages: 1 });
  const [openCalendarPopoverDate, setOpenCalendarPopoverDate] = useState<string | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!openCalendarPopoverDate) return;

    function handlePopoverKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenCalendarPopoverDate(null);
      }
    }

    function handleOutsidePointerDown(event: PointerEvent) {
      if (!calendarPopoverRef.current?.contains(event.target as Node)) {
        setOpenCalendarPopoverDate(null);
      }
    }

    document.addEventListener("keydown", handlePopoverKeyDown);
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    const focusFrame = window.requestAnimationFrame(() => {
      calendarPopoverRef.current?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handlePopoverKeyDown);
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [openCalendarPopoverDate]);

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

    writeMeetingViewPreference(newView);
  };

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    setOpenCalendarPopoverDate(null);
    const newMonth = addMonths(activeMonth, -1);
    setActiveMonth(newMonth);
    const newDate = firstDateInMonth(newMonth, activeDate, todayKey);
    setActiveDate(newDate);
    updateUrlParams({ month: newMonth, date: newDate });
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    setOpenCalendarPopoverDate(null);
    const newMonth = addMonths(activeMonth, 1);
    setActiveMonth(newMonth);
    const newDate = firstDateInMonth(newMonth, activeDate, todayKey);
    setActiveDate(newDate);
    updateUrlParams({ month: newMonth, date: newDate });
  };

  const handleToday = (e: React.MouseEvent) => {
    e.preventDefault();
    setOpenCalendarPopoverDate(null);
    const newMonth = todayKey.slice(0, 7);
    setActiveMonth(newMonth);
    setActiveDate(todayKey);
    updateUrlParams({ month: newMonth, date: todayKey });
  };

  const handleDateClick = (e: React.MouseEvent, day: string) => {
    e.preventDefault();
    if (!day.startsWith(activeMonth)) return;
    setOpenCalendarPopoverDate(null);
    const newMonth = day.slice(0, 7);
    setActiveMonth(newMonth);
    setActiveDate(day);
    updateUrlParams({ month: newMonth, date: day });
  };

  const toggleCalendarPopover = (day: string) => {
    setOpenCalendarPopoverDate((current) => (current === day ? null : day));
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
  // A new search is a new result set, so paging starts over rather than carrying
  // however far the reader had expanded the previous one. Recording which search
  // the count belongs to lets that reset happen during render, with no effect and
  // no cascading re-render.
  const listPages = listPaging.search === highlight ? listPaging.pages : 1;
  const visibleListMeetings = sortedMeetings.slice(0, listPages * LIST_PAGE_SIZE);
  const hiddenListCount = sortedMeetings.length - visibleListMeetings.length;
  const activeDateMeetings = meetingsByDate.get(activeDate) || [];
  const monthMeetingCount = monthDays
    .filter((day) => day.startsWith(activeMonth))
    .reduce((sum, day) => sum + (meetingsByDate.get(day)?.length || 0), 0);
  const activeMonthLabel = formatDateKey(`${activeMonth}-01`, {
    month: "long",
    year: "numeric"
  }, locale);
  const weekdayLabels = weekdays(locale);
  const viewingCurrentMonth = activeMonth === todayKey.slice(0, 7);
  const listDateGroups = groupListMeetingsByDay(visibleListMeetings);

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <div className="segmented-control w-full sm:w-auto">
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
                  "flex-1 justify-center sm:flex-none",
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
              activeView !== "calendar" && "hidden"
            )}
          >
            <section className="quiet-card overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-black/10 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="label-eyebrow text-civic">{t(locale, "monthView")}</p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-2xl font-black capitalize text-ink">{activeMonthLabel}</h2>
                    <span className="text-sm font-semibold text-black/55">
                      {monthMeetingCount === 1
                        ? locale === "es"
                          ? "1 reunión"
                          : "1 meeting"
                        : locale === "es"
                          ? `${monthMeetingCount} reuniones`
                          : `${monthMeetingCount} meetings`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToday}
                    disabled={viewingCurrentMonth && activeDate === todayKey}
                    className="action-secondary-sm disabled:cursor-default disabled:opacity-50 disabled:hover:border-black/15 disabled:hover:bg-white"
                  >
                    {t(locale, "today")}
                  </button>
                  <div className="inline-flex overflow-hidden rounded-lg border border-black/15 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      aria-label={t(locale, "previous")}
                      title={t(locale, "previous")}
                      className="inline-flex h-10 w-10 items-center justify-center text-black/65 transition hover:bg-[#f7fbff] hover:text-civic focus-visible:focus-ring"
                    >
                      <ChevronLeft aria-hidden className="h-4 w-4" />
                    </button>
                    <span aria-hidden className="w-px bg-black/10" />
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      aria-label={t(locale, "next")}
                      title={t(locale, "next")}
                      className="inline-flex h-10 w-10 items-center justify-center text-black/65 transition hover:bg-[#f7fbff] hover:text-civic focus-visible:focus-ring"
                    >
                      <ChevronRight aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-black/10 bg-[#fbfcfd] px-4 py-2 text-[11px] font-bold text-black/55 sm:px-5">
                {(["upcoming", "past", "cancelled"] as MeetingTone[]).map((tone) => (
                  <span key={tone} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className={cn("h-2 w-2 rounded-full", TONE_DOTS[tone])} />
                    {statusLabel(locale, tone === "upcoming" ? "Upcoming" : tone === "past" ? "Past" : "Cancelled")}
                  </span>
                ))}
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[620px] sm:min-w-[720px]">
                  <div className="grid grid-cols-7 border-b border-black/10 bg-white">
                    {weekdayLabels.map((day, index) => (
                      <div
                        key={day}
                        className={cn(
                          "px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[0.08em]",
                          index === 0 || index === 6 ? "text-black/35" : "text-black/55"
                        )}
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid auto-rows-auto grid-cols-7">
                    {monthDays.map((day, dayIndex) => {
                      const inMonth = day.startsWith(activeMonth);
                      const dayMeetings = inMonth ? meetingsByDate.get(day) || [] : [];
                      const isPopoverOpen = openCalendarPopoverDate === day;
                      const calendarDayLayout = visibleCalendarMeetings(dayMeetings);
                      const isSelected = inMonth && day === activeDate;
                      const isToday = inMonth && day === todayKey;
                      const isWeekend = dayIndex % 7 === 0 || dayIndex % 7 === 6;

                      return (
                        <div
                          key={day}
                          className={cn(
                            "relative flex min-h-[132px] flex-col gap-1 border-b border-r border-black/[0.08] p-1.5 [&:nth-child(7n)]:border-r-0",
                            !inMonth
                              ? "bg-[repeating-linear-gradient(135deg,#f6f8fa_0,#f6f8fa_6px,#f1f4f7_6px,#f1f4f7_12px)]"
                              : isWeekend
                                ? "bg-[#fbfcfd]"
                                : "bg-white",
                            isSelected && "z-10 bg-[#f5f9ff] shadow-[inset_0_0_0_2px_rgba(36,87,166,0.55)]",
                            isPopoverOpen && "z-30"
                          )}
                        >
                          <button
                            type="button"
                            onClick={(e) => handleDateClick(e, day)}
                            disabled={!inMonth}
                            aria-current={isToday ? "date" : undefined}
                            aria-pressed={isSelected}
                            aria-label={
                              locale === "es"
                                ? `Seleccionar ${formatDateKey(day, { month: "long", day: "numeric" }, locale)}`
                                : `Select ${formatDateKey(day, { month: "long", day: "numeric" }, locale)}`
                            }
                            className={cn(
                              "absolute inset-0 z-0 transition focus-visible:focus-ring",
                              inMonth ? "cursor-pointer hover:bg-civic/[0.035]" : "cursor-default"
                            )}
                          />
                          <div className="pointer-events-none relative z-10 flex items-center justify-between gap-1 px-0.5">
                            <span
                              className={cn(
                                "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-black tabular-nums leading-none transition",
                                isToday
                                  ? "bg-civic text-white shadow-sm"
                                  : isSelected
                                    ? "text-civic"
                                    : inMonth
                                      ? day < todayKey
                                        ? "text-black/45"
                                        : "text-ink"
                                      : "text-black/20"
                              )}
                            >
                              {Number(day.slice(-2))}
                            </span>
                            {dayMeetings.length > 0 ? (
                              <span className="text-[10px] font-bold tabular-nums text-black/35">
                                {dayMeetings.length}
                              </span>
                            ) : null}
                          </div>
                          <div className="pointer-events-none relative z-10 flex flex-none flex-col gap-1">
                            {calendarDayLayout.visibleMeetings.map((meeting) => (
                              <CalendarMeetingLink
                                key={meeting.id}
                                meeting={meeting}
                                highlight={highlight}
                                locale={locale}
                              />
                            ))}
                          </div>
                          {calendarDayLayout.overflowCount > 0 ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleCalendarPopover(day);
                              }}
                              aria-expanded={isPopoverOpen}
                              aria-controls={`calendar-popover-${day}`}
                              className={cn(
                                "relative z-20 self-start rounded px-1 py-0.5 text-left text-[11px] font-semibold leading-4 text-black/55 hover:text-ink transition hover:bg-black/[0.05] focus-visible:focus-ring",
                                isPopoverOpen && "bg-black/[0.05] text-ink"
                              )}
                              aria-label={
                                locale === "es"
                                  ? `Mostrar ${calendarDayLayout.overflowCount} reuniones más del ${formatDateKey(day, { month: "long", day: "numeric" }, locale)}`
                                  : `Show ${calendarDayLayout.overflowCount} more meetings on ${formatDateKey(day, { month: "long", day: "numeric" }, locale)}`
                              }
                            >
                              {locale === "es"
                                ? `+${calendarDayLayout.overflowCount} más`
                                : `+${calendarDayLayout.overflowCount} more`}
                            </button>
                          ) : null}
                          {isPopoverOpen ? (
                            <div
                              id={`calendar-popover-${day}`}
                              role="dialog"
                              ref={calendarPopoverRef}
                              tabIndex={-1}
                              aria-label={formatDateKey(day, {
                                weekday: "long",
                                month: "long",
                                day: "numeric"
                              }, locale)}
                              className={cn(
                                "floating-surface pointer-events-auto absolute z-40 w-[min(300px,calc(100vw-2rem))] bg-white outline-none",
                                dayIndex % 7 >= 5 ? "right-1" : "left-1",
                                dayIndex >= 28 ? "bottom-1" : "top-1"
                              )}
                            >
                              <div className="flex items-baseline justify-between gap-2 border-b border-black/10 px-3 py-2.5">
                                <p className="text-sm font-black capitalize text-ink">
                                  {formatDateKey(day, {
                                    weekday: "long",
                                    month: "short",
                                    day: "numeric"
                                  }, locale)}
                                </p>
                                <p className="text-[11px] font-bold text-black/50">
                                  {locale === "es"
                                    ? `${dayMeetings.length} reuniones`
                                    : `${dayMeetings.length} meetings`}
                                </p>
                              </div>
                              <div className="grid max-h-[min(55vh,420px)] gap-1 overflow-y-auto p-2">
                                {dayMeetings.map((meeting) => (
                                  <CalendarMeetingLink
                                    key={meeting.id}
                                    meeting={meeting}
                                    highlight={highlight}
                                    locale={locale}
                                    expanded
                                  />
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            <aside className="quiet-card overflow-hidden lg:sticky lg:top-24">
              <div className="border-b border-black/10 bg-[#fbfcfd] p-4">
                <p className="label-eyebrow text-civic">{t(locale, "dayView")}</p>
                <h2 className="mt-1 text-xl font-black capitalize text-ink">
                  {activeDate
                    ? formatDateKey(activeDate, {
                        weekday: "long",
                        month: "short",
                        day: "numeric"
                      }, locale)
                    : t(locale, "selectADay")}
                </h2>
                <p className="mt-1 text-sm font-semibold text-black/55">
                  {activeDateMeetings.length === 1
                    ? locale === "es"
                      ? "1 reunión indicada."
                      : "1 meeting listed."
                    : locale === "es"
                      ? `${activeDateMeetings.length} reuniones indicadas.`
                      : `${activeDateMeetings.length} meetings listed.`}
                </p>
              </div>
              <div className="max-h-[calc(100vh-14rem)] divide-y divide-black/[0.08] overflow-y-auto">
                {activeDateMeetings.length > 0 ? (
                  activeDateMeetings.map((meeting) => (
                    <div key={meeting.id} className="px-4 py-3.5">
                      <MeetingLine meeting={meeting} compact highlight={highlight} locale={locale} />
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center px-4 py-8 text-center">
                    <span className="icon-tile-sm">
                      <CalendarDays aria-hidden className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-sm font-semibold leading-6 text-black/60">
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
              activeView !== "list" && "hidden"
            )}
          >
            <div className="flex flex-col gap-2 border-b border-black/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-black/55">
                <Search aria-hidden className="h-4 w-4" />
                {locale === "es"
                  ? "La búsqueda se aplica a esta lista."
                  : "Search applies to this list."}
              </p>
            </div>
            <div className="divide-y divide-black/10">
              {listDateGroups.map((group) => {
                const isToday = group.key === todayKey;

                return (
                  <section
                    key={group.key}
                    aria-label={
                      group.key === "date-not-listed"
                        ? t(locale, "dateNotListed")
                        : formatDateKey(group.key, { weekday: "long", month: "long", day: "numeric", year: "numeric" }, locale)
                    }
                    className={cn(
                      "grid gap-3 px-4 py-4 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-6 sm:px-6 sm:py-5",
                      isToday && "bg-[#f7fbff]"
                    )}
                  >
                    <div className="flex items-center gap-3 sm:block">
                      <div className="sm:sticky sm:top-24">
                        <ListDateBadge dateKey={group.key} todayKey={todayKey} locale={locale} />
                      </div>
                      <p className="text-sm font-bold text-black/60 sm:hidden">
                        {group.key === "date-not-listed"
                          ? null
                          : formatDateKey(group.key, { weekday: "long", month: "long", day: "numeric", year: "numeric" }, locale)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      {group.key !== "date-not-listed" ? (
                        <p className="hidden pb-1 text-xs font-bold uppercase tracking-[0.06em] text-black/45 sm:block">
                          <HighlightedText
                            text={formatDateKey(group.key, { weekday: "long", month: "long", day: "numeric", year: "numeric" }, locale)}
                            query={highlight}
                          />
                          {isToday ? (
                            <span className="ml-2 rounded-full bg-civic px-2 py-0.5 text-[10px] tracking-[0.04em] text-white">
                              {t(locale, "today")}
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      <div className="divide-y divide-black/[0.07]">
                        {group.meetings.map((meeting) => (
                          <article key={meeting.id} className="py-3 first:pt-2 last:pb-0">
                            <MeetingLine meeting={meeting} highlight={highlight} locale={locale} />
                          </article>
                        ))}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
            {hiddenListCount > 0 ? (
              <div className="border-t border-black/10 bg-[#fbfcfd] p-5 text-center">
                <button
                  type="button"
                  onClick={() => setListPaging({ search: highlight, pages: listPages + 1 })}
                  className="action-secondary-sm"
                >
                  {locale === "es"
                    ? `Mostrar ${Math.min(hiddenListCount, LIST_PAGE_SIZE)} reuniones más`
                    : `Show ${Math.min(hiddenListCount, LIST_PAGE_SIZE)} more meetings`}
                </button>
                <p className="mt-2 text-sm font-semibold text-black/55">
                  {locale === "es"
                    ? `Mostrando ${visibleListMeetings.length} de ${sortedMeetings.length}.`
                    : `Showing ${visibleListMeetings.length} of ${sortedMeetings.length}.`}
                </p>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
