import assert from "node:assert/strict";
import test from "node:test";
import { findMalformedCalendarDuplicatePairs } from "@/lib/db/reconcileMeetings";

const calendarUrl = "https://sanmateocounty.legistar.com/Calendar.aspx";
const meetingDatetime = "2026-06-16T16:00:00.000Z";
const rows = [
  {
    id: "malformed",
    title: "Upcoming Meetings Name Meeting Date BOARD OF SUPERVISORS",
    meeting_datetime: meetingDatetime,
    section: "Unknown",
    source_url: calendarUrl
  },
  {
    id: "canonical",
    title: "BOARD OF SUPERVISORS",
    meeting_datetime: meetingDatetime,
    section: "All Meetings",
    source_url: "https://sanmateocounty.legistar.com/View.ashx?M=A&ID=1423223"
  }
];

test("matches a malformed calendar row to its canonical meeting", () => {
  assert.deepEqual(findMalformedCalendarDuplicatePairs(rows, calendarUrl), {
    pairs: [{ duplicateId: "malformed", canonicalId: "canonical" }],
    protectedDuplicatesSkipped: 0
  });
});

test("does not delete a duplicate that owns published data", () => {
  assert.deepEqual(
    findMalformedCalendarDuplicatePairs(rows, calendarUrl, new Set(["malformed"])),
    { pairs: [], protectedDuplicatesSkipped: 1 }
  );
});

test("does not merge simultaneous meetings with unrelated titles", () => {
  const unrelated = rows.map((row) =>
    row.id === "canonical" ? { ...row, title: "PLANNING COMMISSION" } : row
  );
  assert.deepEqual(findMalformedCalendarDuplicatePairs(unrelated, calendarUrl).pairs, []);
});
