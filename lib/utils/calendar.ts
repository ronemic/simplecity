import type { MeetingRow } from "@/lib/types";
import { CIVIC_TIME_ZONE, hasDisplayableMeetingTime, parseMeetingDate } from "@/lib/utils/date";
import { displayMeetingText } from "@/lib/utils/meetingDisplay";

const DEFAULT_MEETING_DURATION_MINUTES = 120;

type CalendarMeeting = Pick<
  MeetingRow,
  "title" | "meeting_type" | "date_text" | "meeting_datetime" | "source_url"
>;

function toGoogleCalendarDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function buildGoogleCalendarUrl(
  meeting: CalendarMeeting,
  durationMinutes = DEFAULT_MEETING_DURATION_MINUTES
) {
  const startValue = meeting.meeting_datetime || parseMeetingDate(meeting.date_text);
  if (!startValue) return null;
  if (!hasDisplayableMeetingTime(meeting.date_text, startValue)) return null;

  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const details = [
    meeting.meeting_type ? `Meeting type: ${displayMeetingText(meeting.meeting_type)}` : null,
    meeting.source_url ? `Official source: ${meeting.source_url}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: displayMeetingText(meeting.title),
    dates: `${toGoogleCalendarDate(start)}/${toGoogleCalendarDate(end)}`,
    ctz: CIVIC_TIME_ZONE
  });

  if (details) params.set("details", details);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
