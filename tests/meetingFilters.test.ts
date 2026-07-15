import assert from "node:assert/strict";
import test from "node:test";
import type { MeetingRow } from "@/lib/types";
import {
  matchesMeetingFilters,
  meetingSearchMatch
} from "@/lib/utils/meetingFilters";

const meeting = {
  id: "meeting-1",
  jurisdiction_name: "Menlo Park",
  jurisdiction_slug: "menlo-park",
  title: "Transportation Commission",
  meeting_type: "Transportation Commission",
  date_text: "Feb. 24, 2026",
  meeting_datetime: "2026-02-24T17:30:00-08:00",
  time_text: "5:30 PM",
  status: "Upcoming"
} as MeetingRow;

test("meeting date search matches complete numeric tokens", () => {
  assert.equal(matchesMeetingFilters(meeting, "feb 24"), true);
  assert.equal(matchesMeetingFilters(meeting, "feb. 24"), true);
  assert.equal(matchesMeetingFilters(meeting, "feb 4"), false);
  assert.equal(matchesMeetingFilters(meeting, "feb 2"), false);
});

test("meeting search checks the same public fields rendered by both views", () => {
  assert.equal(meetingSearchMatch(meeting, "transport")?.field, "title");
  assert.equal(meetingSearchMatch(meeting, "menlo park")?.field, "jurisdiction");
  assert.equal(meetingSearchMatch(meeting, "upcoming"), null);
  assert.equal(meetingSearchMatch(meeting, "5:30")?.field, "date");
});
