import assert from "node:assert/strict";
import test from "node:test";
import type { PrimeGovMeeting } from "@/lib/types";
import { filterMeetingsToWindow, getMeetingWindow } from "@/lib/utils/meetingWindow";

function meeting(dateText: string): PrimeGovMeeting {
  return {
    section: "Unknown",
    title: dateText,
    meetingType: "Test Meeting",
    dateText,
    rowText: dateText,
    hasHtmlAgenda: false,
    hasPdf: false,
    documents: []
  };
}

test("uses the same full calendar-month window for every meeting source", () => {
  const now = new Date("2026-07-13T19:00:00Z");
  const meetings = [
    meeting("May 31, 2026"),
    meeting("June 1, 2026"),
    meeting("August 31, 2026"),
    meeting("September 1, 2026")
  ];

  assert.deepEqual(
    filterMeetingsToWindow(meetings, {}, now).map((item) => item.dateText),
    ["June 1, 2026", "August 31, 2026"]
  );
});

test("calculates the current month in Pacific time", () => {
  const window = getMeetingWindow({}, new Date("2026-08-01T03:00:00Z"));
  const juneFirst = new Date(window.start);

  assert.equal(juneFirst.toISOString(), "2026-06-01T07:00:00.000Z");
});
