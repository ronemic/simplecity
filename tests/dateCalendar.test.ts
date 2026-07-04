import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleCalendarUrl } from "@/lib/utils/calendar";
import { formatDisplayDate, hasDisplayableMeetingTime, parseMeetingDate } from "@/lib/utils/date";

test("date-only meetings render without an invented midnight time", () => {
  const formatted = formatDisplayDate("June 13, 2026", "2026-06-13T07:00:00.000Z");

  assert.equal(formatted, "Jun 13, 2026");
  assert.equal(hasDisplayableMeetingTime("June 13, 2026", "2026-06-13T07:00:00.000Z"), false);
});

test("meetings with a real stored time still render the time", () => {
  const formatted = formatDisplayDate("June 13, 2026", "2026-06-13T17:00:00.000Z");

  assert.match(formatted, /10:00 AM/);
  assert.equal(hasDisplayableMeetingTime("June 13, 2026", "2026-06-13T17:00:00.000Z"), true);
});

test("parser handles agenda-style a.m. and p.m. clock text", () => {
  assert.equal(parseMeetingDate("June 8, 2026 7:00 p.m."), "2026-06-09T02:00:00.000Z");
  assert.equal(parseMeetingDate("6/8/2026 10:30 a.m."), "2026-06-08T17:30:00.000Z");
});

test("calendar links are omitted for date-only meetings", () => {
  const calendarUrl = buildGoogleCalendarUrl({
    title: "City Council",
    meeting_type: "Regular Meeting",
    date_text: "June 13, 2026",
    time_text: null,
    meeting_datetime: "2026-06-13T07:00:00.000Z",
    source_url: "https://city.example/meeting"
  });

  assert.equal(calendarUrl, null);
});

test("calendar links are available when an actual meeting time exists", () => {
  const calendarUrl = buildGoogleCalendarUrl({
    title: "City Council",
    meeting_type: "Regular Meeting",
    date_text: "June 13, 2026",
    time_text: "10:00 AM",
    meeting_datetime: "2026-06-13T17:00:00.000Z",
    source_url: "https://city.example/meeting"
  });

  assert.ok(calendarUrl?.startsWith("https://calendar.google.com/calendar/render?"));
});
