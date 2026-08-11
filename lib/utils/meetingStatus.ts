import { hasExplicitClockTime, parseMeetingDate } from "@/lib/utils/date";

type MeetingStatusFields = {
  date_text?: string | null;
  meeting_datetime?: string | null;
  section?: string | null;
  status?: string | null;
  time_text?: string | null;
};

type SourceMeetingStatusFields = {
  dateText?: string | null;
  timeText?: string | null;
  section?: string | null;
  status?: string | null;
};

function sectionForEffectiveStatus(section: string | null | undefined, status: string | null | undefined) {
  if (status === "Past" && [
    "Unknown",
    "All Meetings",
    "Upcoming Meetings",
    "Current And Upcoming Meetings"
  ].includes(section || "")) {
    return "Past Meetings";
  }

  if (status === "Upcoming" && [
    "Unknown",
    "All Meetings",
    "Past Meetings",
    "Archived Meetings"
  ].includes(section || "")) {
    return "Upcoming Meetings";
  }

  return section;
}

function dateOnlyCurrentDayStatus(
  status: string | null | undefined,
  section: string | null | undefined
) {
  if (
    (status === "Past" || status === "Upcoming") &&
    (section === "All Meetings" || section === "Unknown")
  ) {
    return "Upcoming";
  }
  return status;
}

function civicDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function civicDateKey(value: Date) {
  const { year, month, day } = civicDateParts(value);
  return year * 10_000 + month * 100 + day;
}

export function civicDayBounds(now: Date = new Date()) {
  const { year, month, day } = civicDateParts(now);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  const tomorrowParts = {
    year: tomorrow.getUTCFullYear(),
    month: tomorrow.getUTCMonth() + 1,
    day: tomorrow.getUTCDate()
  };
  return {
    startIso: parseMeetingDate(`${month}/${day}/${year}`)!,
    nextStartIso: parseMeetingDate(
      `${tomorrowParts.month}/${tomorrowParts.day}/${tomorrowParts.year}`
    )!
  };
}

export function effectiveMeetingStatus(
  status?: string | null,
  meetingDatetime?: string | null,
  now: Date = new Date()
) {
  if ((status !== "Upcoming" && status !== "Past") || !meetingDatetime) return status;

  const meetingTime = new Date(meetingDatetime).getTime();
  if (Number.isNaN(meetingTime)) return status;

  return meetingTime < now.getTime() ? "Past" : "Upcoming";
}

export function withEffectiveMeetingStatus<T extends MeetingStatusFields>(
  meeting: T,
  now: Date = new Date()
): T {
  const meetingTime = meeting.meeting_datetime
    ? new Date(meeting.meeting_datetime)
    : null;
  const hasDateMetadata = meeting.date_text !== undefined || meeting.time_text !== undefined;
  const dateOnlyOnCurrentCivicDay = Boolean(
    meetingTime &&
      !Number.isNaN(meetingTime.getTime()) &&
      hasDateMetadata &&
      !hasExplicitClockTime([meeting.date_text, meeting.time_text].filter(Boolean).join(" ")) &&
      civicDateKey(meetingTime) === civicDateKey(now)
  );
  const status = dateOnlyOnCurrentCivicDay
    ? dateOnlyCurrentDayStatus(meeting.status, meeting.section)
    : effectiveMeetingStatus(meeting.status, meeting.meeting_datetime, now);
  if (status === meeting.status) return meeting;

  return {
    ...meeting,
    status,
    section: sectionForEffectiveStatus(meeting.section, status)
  };
}

export function withEffectiveSourceMeetingStatus<T extends SourceMeetingStatusFields>(
  meeting: T,
  now: Date = new Date()
): T {
  const dateTimeText = [meeting.dateText, meeting.timeText].filter(Boolean).join(" ");
  const meetingIso = parseMeetingDate(dateTimeText);
  const meetingTime = meetingIso ? new Date(meetingIso) : null;
  const dateOnlyOnCurrentCivicDay = Boolean(
    meetingTime &&
      !Number.isNaN(meetingTime.getTime()) &&
      !hasExplicitClockTime(dateTimeText) &&
      civicDateKey(meetingTime) === civicDateKey(now)
  );
  const status = dateOnlyOnCurrentCivicDay
    ? dateOnlyCurrentDayStatus(meeting.status, meeting.section)
    : effectiveMeetingStatus(meeting.status, meetingIso, now);
  const section = sectionForEffectiveStatus(meeting.section, status);
  if (status === meeting.status && section === meeting.section) return meeting;

  return {
    ...meeting,
    status,
    section
  };
}
