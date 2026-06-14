import { CalendarDays, ChevronLeft, ChevronRight, Clock, FileText, Search } from "lucide-react";
import { AddToGoogleCalendarLink } from "@/components/AddToGoogleCalendarLink";
import { PendingLink } from "@/components/PendingLink";
import { StatusPill } from "@/components/StatusPill";
import type { MeetingRow } from "@/lib/types";
import {
  CIVIC_TIME_ZONE,
  formatDisplayDate,
  hasDisplayableMeetingTime,
  parseMeetingDate
} from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type MeetingCalendarProps = {
  meetings: MeetingRow[];
  jurisdiction: string;
  search?: string;
  status?: string;
  month?: string;
  selectedDate?: string;
};

function jurisdictionLabel(meeting: MeetingRow) {
  if (meeting.jurisdiction_slug === "san-mateo-city") return "San Mateo";
  if (meeting.jurisdiction_slug === "santa-clara-county") return "Santa Clara County";
  return meeting.jurisdiction_name || "Foster City";
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

function buildMeetingsHref({
  jurisdiction,
  search,
  status,
  month,
  date
}: {
  jurisdiction: string;
  search?: string;
  status?: string;
  month?: string;
  date?: string;
}) {
  const params = new URLSearchParams();
  params.set("jurisdiction", jurisdiction);
  if (search) params.set("q", search);
  if (status) params.set("status", status);
  if (month) params.set("month", month);
  if (date) params.set("date", date);
  return `/meetings?${params.toString()}`;
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

function MeetingLine({ meeting, compact = false }: { meeting: MeetingRow; compact?: boolean }) {
  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-[4.25rem_1fr]" : "sm:grid-cols-[7rem_1fr_auto] sm:items-center")}>
      <div className="flex items-center gap-1.5 text-sm font-black text-[#12365f]">
        <Clock aria-hidden className="h-3.5 w-3.5" />
        <span>{meetingTimeLabel(meeting)}</span>
      </div>
      <div className="min-w-0">
        <PendingLink
          href={meetingHref(meeting)}
          className="line-clamp-2 text-sm font-black leading-5 text-ink transition hover:text-civic focus-visible:focus-ring"
          pendingLabel="Opening meeting"
        >
          {meeting.title}
        </PendingLink>
        <p className="mt-1 text-xs font-semibold leading-5 text-black/55">
          {meeting.meeting_type || "Meeting type not listed"} · {jurisdictionLabel(meeting)}
        </p>
      </div>
      {!compact ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <StatusPill status={meeting.status} />
          <AddToGoogleCalendarLink meeting={meeting} compact className="min-h-9 px-3 py-2" />
        </div>
      ) : null}
    </div>
  );
}

export function MeetingList({
  meetings,
  jurisdiction,
  search = "",
  status = "",
  month,
  selectedDate
}: MeetingCalendarProps) {
  const todayKey = dateKeyFromDate(new Date());
  const activeMonth = isValidMonthKey(month) ? month : todayKey.slice(0, 7);
  const activeDate =
    isValidDateKey(selectedDate) && selectedDate?.startsWith(activeMonth)
      ? selectedDate
      : todayKey.startsWith(activeMonth)
        ? todayKey
        : `${activeMonth}-01`;
  const monthDays = buildMonthDays(activeMonth);
  const meetingsByDate = groupMeetingsByDate(meetings);
  const sortedMeetings = [...meetings].sort((left, right) => meetingSortTime(left) - meetingSortTime(right));
  const activeDateMeetings = meetingsByDate.get(activeDate) || [];
  const monthMeetingCount = monthDays
    .filter((day) => day.startsWith(activeMonth))
    .reduce((sum, day) => sum + (meetingsByDate.get(day)?.length || 0), 0);
  const activeMonthLabel = formatDateKey(`${activeMonth}-01`, {
    month: "long",
    year: "numeric"
  });
  const todayLabel = formatDateKey(todayKey, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  if (meetings.length === 0) {
    return (
      <div className="quiet-card p-8 text-center">
        <FileText aria-hidden className="mx-auto h-10 w-10 text-black/40" />
        <h2 className="mt-3 text-xl font-bold text-ink">No meetings match those filters</h2>
        <p className="mt-2 text-sm leading-6 text-black/70">
          Try a broader search, a different status, or another jurisdiction.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section className="quiet-card overflow-hidden">
          <div className="grid gap-4 border-b border-black/10 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start sm:p-5">
            <div>
              <p className="label-eyebrow text-civic">Month view</p>
              <h2 className="mt-1 text-2xl font-black text-ink">{activeMonthLabel}</h2>
              <p className="mt-1 text-sm font-semibold text-black/60">
                Today is {todayLabel}. {monthMeetingCount} meetings shown this month.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 md:flex-nowrap">
              <a
                href={buildMeetingsHref({
                  jurisdiction,
                  search,
                  status,
                  month: addMonths(activeMonth, -1)
                })}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-black/15 px-3 py-2 text-sm font-bold text-ink transition hover:bg-black/[0.035] focus-visible:focus-ring"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
                Previous
              </a>
              <a
                href={buildMeetingsHref({
                  jurisdiction,
                  search,
                  status,
                  month: todayKey.slice(0, 7),
                  date: todayKey
                })}
                className="inline-flex min-h-10 items-center rounded-md border border-civic/20 bg-[#eef5ff] px-3 py-2 text-sm font-black text-civic transition hover:bg-[#e0edff] focus-visible:focus-ring"
              >
                Today
              </a>
              <a
                href={buildMeetingsHref({
                  jurisdiction,
                  search,
                  status,
                  month: addMonths(activeMonth, 1)
                })}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-black/15 px-3 py-2 text-sm font-bold text-ink transition hover:bg-black/[0.035] focus-visible:focus-ring"
              >
                Next
                <ChevronRight aria-hidden className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 border-b border-black/10 bg-[#f8fafb]">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="px-3 py-2 text-xs font-black uppercase text-black/55">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((day) => {
                  const dayMeetings = meetingsByDate.get(day) || [];
                  const inMonth = day.startsWith(activeMonth);
                  const isToday = day === todayKey;
                  const isSelected = day === activeDate;

                  return (
                    <div
                      key={day}
                      className={cn(
                        "min-h-[158px] border-b border-r border-black/10 p-2",
                        !inMonth && "bg-black/[0.025] text-black/40",
                        isToday && "bg-[#fff8df]",
                        isSelected && "shadow-[inset_0_0_0_2px_#2f65e8]"
                      )}
                    >
                      <a
                        href={buildMeetingsHref({
                          jurisdiction,
                          search,
                          status,
                          month: day.slice(0, 7),
                          date: day
                        })}
                        className={cn(
                          "inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-black transition hover:bg-civic/10 focus-visible:focus-ring",
                          isToday ? "bg-civic text-white hover:bg-civic" : "text-ink"
                        )}
                      >
                        {Number(day.slice(-2))}
                      </a>
                      {isToday ? (
                        <span className="ml-1 rounded bg-[#fff0bd] px-1.5 py-0.5 text-[11px] font-black uppercase text-[#7a5200]">
                          Today
                        </span>
                      ) : null}
                      <div className="mt-2 grid gap-1.5">
                        {dayMeetings.map((meeting) => (
                          <PendingLink
                            key={meeting.id}
                            href={meetingHref(meeting)}
                            className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-left text-[12px] font-bold leading-4 text-ink transition hover:border-civic/25 hover:bg-[#eef5ff] focus-visible:focus-ring"
                            pendingLabel="Opening meeting"
                          >
                            <span className="block text-[#12365f]">{meetingTimeLabel(meeting)}</span>
                            <span className="line-clamp-2">{meeting.title}</span>
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
          <div className="border-b border-black/10 p-5">
            <p className="label-eyebrow text-civic">Day view</p>
            <h2 className="mt-1 text-2xl font-black text-ink">
              {formatDateKey(activeDate, {
                weekday: "long",
                month: "short",
                day: "numeric"
              })}
            </h2>
            <p className="mt-1 text-sm font-semibold text-black/60">
              {activeDate === todayKey ? "This is today." : `Today is ${formatDateKey(todayKey, { month: "short", day: "numeric" })}.`}
            </p>
          </div>
          <div className="divide-y divide-black/10">
            {activeDateMeetings.length > 0 ? (
              activeDateMeetings.map((meeting) => (
                <div key={meeting.id} className="p-4">
                  <MeetingLine meeting={meeting} compact />
                </div>
              ))
            ) : (
              <div className="p-5">
                <p className="text-sm font-semibold leading-6 text-black/70">
                  No meetings are listed for this day with the current filters.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <section className="quiet-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-black/10 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-eyebrow text-civic">All matching meetings</p>
            <h2 className="mt-1 text-2xl font-black text-ink">
              {meetings.length === 1 ? "1 meeting" : `${meetings.length} meetings`}
            </h2>
          </div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-black/60">
            <Search aria-hidden className="h-4 w-4" />
            Search and status filters apply to the calendar and this full list.
          </p>
        </div>
        <div className="divide-y divide-black/10">
          {sortedMeetings.map((meeting) => (
            <article key={meeting.id} className="grid gap-4 p-5 transition hover:bg-black/[0.025] sm:p-6">
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
    </div>
  );
}
