import assert from "node:assert/strict";
import { test } from "node:test";
import { CIVIC_TIME_ZONE, parseMeetingDate } from "@/lib/utils/date";

function pacificClock(iso: string | null) {
  assert.ok(iso, "expected a parsed timestamp");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CIVIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(iso as string));
}

function pacificDate(iso: string | null) {
  assert.ok(iso, "expected a parsed timestamp");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CIVIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso as string));
}

test("keeps PM when the source time includes seconds", () => {
  // Redwood City's portal emits this shape. The meridiem used to be dropped
  // because the pattern expected it immediately after the minutes, so a 1pm
  // council meeting was stored as 1am — a 12-hour error shown to the public.
  const iso = parseMeetingDate("8/13/2026 1:00:00 PM");
  assert.equal(pacificDate(iso), "2026-08-13");
  assert.equal(pacificClock(iso), "13:00");
});

test("keeps PM with seconds on an evening meeting", () => {
  assert.equal(pacificClock(parseMeetingDate("6/8/2026 6:00:00 PM")), "18:00");
});

test("keeps AM with seconds", () => {
  assert.equal(pacificClock(parseMeetingDate("6/8/2026 9:30:00 AM")), "09:30");
});

test("still parses times without seconds", () => {
  assert.equal(pacificClock(parseMeetingDate("Aug 18, 2026 06:00 PM")), "18:00");
  assert.equal(pacificClock(parseMeetingDate("8/13/2026 1:00 PM")), "13:00");
});

test("handles dotted and spaced meridiems", () => {
  assert.equal(pacificClock(parseMeetingDate("August 12, 2026 6:30 p.m.")), "18:30");
  assert.equal(pacificClock(parseMeetingDate("Aug. 10, 2026 7:00 p. m.")), "19:00");
});

test("midnight and noon edges", () => {
  assert.equal(pacificClock(parseMeetingDate("8/13/2026 12:00:00 AM")), "00:00");
  assert.equal(pacificClock(parseMeetingDate("8/13/2026 12:00:00 PM")), "12:00");
});

test("24-hour times are preserved", () => {
  assert.equal(pacificClock(parseMeetingDate("8/13/2026 18:30")), "18:30");
});

test("a date with no time is midnight, not a stray number from the text", () => {
  // `\D+` used to skip arbitrary text and treat any following number as the
  // hour, so a room or district number became a meeting time.
  assert.equal(pacificClock(parseMeetingDate("Aug 13, 2026")), "00:00");
  assert.equal(pacificClock(parseMeetingDate("Aug 13, 2026 - Council Chambers 2")), "00:00");
  assert.equal(pacificClock(parseMeetingDate("8/13/2026 Item 4 District 3")), "00:00");
});

test("the date itself is unchanged across formats", () => {
  assert.equal(pacificDate(parseMeetingDate("8/13/2026 1:00:00 PM")), "2026-08-13");
  assert.equal(pacificDate(parseMeetingDate("Aug 18, 2026 06:00 PM")), "2026-08-18");
  assert.equal(pacificDate(parseMeetingDate("August 12, 2026 6:30 p.m.")), "2026-08-12");
});

test("unparseable input stays null", () => {
  assert.equal(parseMeetingDate(""), null);
  assert.equal(parseMeetingDate("Special meeting, date to be determined"), null);
});
