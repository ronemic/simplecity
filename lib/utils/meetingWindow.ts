import type { PrimeGovMeeting } from "@/lib/types";
import { CIVIC_TIME_ZONE, parseMeetingDate } from "@/lib/utils/date";

export type MeetingWindowOptions = {
  monthsBack?: number;
  monthsForward?: number;
};

function yearMonthInCivicTime(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CIVIC_TIME_ZONE,
    year: "numeric",
    month: "numeric"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month) };
}

function firstOfMonth(monthIndex: number) {
  const date = new Date(Date.UTC(2000, monthIndex, 1));
  return parseMeetingDate(`${date.getUTCMonth() + 1}/1/${date.getUTCFullYear()}`);
}

export function getMeetingWindow(
  options: MeetingWindowOptions = {},
  now = new Date()
) {
  const monthsBack = Math.max(0, options.monthsBack ?? 1);
  const monthsForward = Math.max(0, options.monthsForward ?? 1);
  const current = yearMonthInCivicTime(now);
  const currentMonthIndex = (current.year - 2000) * 12 + current.month - 1;
  const startIso = firstOfMonth(currentMonthIndex - monthsBack);
  const endIso = firstOfMonth(currentMonthIndex + monthsForward + 1);

  if (!startIso || !endIso) throw new Error("Unable to calculate the meeting date window.");

  return {
    monthsBack,
    monthsForward,
    start: new Date(startIso).getTime(),
    end: new Date(endIso).getTime()
  };
}

export function isMeetingDateInWindow(
  dateText: string | null | undefined,
  timeText: string | null | undefined,
  options: MeetingWindowOptions = {},
  now = new Date()
) {
  const parsed = parseMeetingDate([dateText, timeText].filter(Boolean).join(" "));
  if (!parsed) return false;
  const timestamp = new Date(parsed).getTime();
  const window = getMeetingWindow(options, now);
  return timestamp >= window.start && timestamp < window.end;
}

export function filterMeetingsToWindow(
  meetings: PrimeGovMeeting[],
  options: MeetingWindowOptions = {},
  now = new Date()
) {
  return meetings.filter((meeting) =>
    isMeetingDateInWindow(meeting.dateText, meeting.timeText, options, now)
  );
}
