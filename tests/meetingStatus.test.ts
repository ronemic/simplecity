import assert from "node:assert/strict";
import test from "node:test";
import {
  civicDayBounds,
  effectiveMeetingStatus,
  withEffectiveMeetingStatus,
  withEffectiveSourceMeetingStatus
} from "@/lib/utils/meetingStatus";

const now = new Date("2026-07-13T20:00:00.000Z");

test("treats a stored upcoming meeting as past after its start time", () => {
  assert.equal(effectiveMeetingStatus("Upcoming", "2026-06-16T16:00:00.000Z", now), "Past");
});

test("keeps future and undated upcoming meetings upcoming", () => {
  assert.equal(effectiveMeetingStatus("Upcoming", "2026-07-14T16:00:00.000Z", now), "Upcoming");
  assert.equal(effectiveMeetingStatus("Upcoming", null, now), "Upcoming");
});

test("corrects a future meeting that was scraped as past", () => {
  assert.equal(effectiveMeetingStatus("Past", "2026-07-14T16:00:00.000Z", now), "Upcoming");

  const meeting = withEffectiveMeetingStatus(
    {
      meeting_datetime: "2026-07-14T16:00:00.000Z",
      section: "All Meetings",
      status: "Past"
    },
    now
  );

  assert.equal(meeting.status, "Upcoming");
  assert.equal(meeting.section, "Upcoming Meetings");
});

test("does not override cancelled or other explicit statuses", () => {
  assert.equal(effectiveMeetingStatus("Cancelled", "2026-06-16T16:00:00.000Z", now), "Cancelled");
  assert.equal(effectiveMeetingStatus("Notice", "2026-06-16T16:00:00.000Z", now), "Notice");
});

test("keeps status and section consistent in public meeting rows", () => {
  const meeting = withEffectiveMeetingStatus(
    {
      meeting_datetime: "2026-06-16T16:00:00.000Z",
      section: "Unknown",
      status: "Upcoming"
    },
    now
  );

  assert.equal(meeting.status, "Past");
  assert.equal(meeting.section, "Past Meetings");
});

test("derives source status from the meeting date when a portal section is ambiguous", () => {
  const future = withEffectiveSourceMeetingStatus(
    {
      dateText: "July 14, 2026",
      timeText: "9:00 AM",
      section: "All Meetings",
      status: "Past"
    },
    now
  );
  const past = withEffectiveSourceMeetingStatus(
    {
      dateText: "June 16, 2026",
      timeText: "9:00 AM",
      section: "Unknown",
      status: "Upcoming"
    },
    now
  );

  assert.deepEqual(
    { status: future.status, section: future.section },
    { status: "Upcoming", section: "Upcoming Meetings" }
  );
  assert.deepEqual(
    { status: past.status, section: past.section },
    { status: "Past", section: "Past Meetings" }
  );
});

test("does not expire a date-only meeting at midnight on the meeting day", () => {
  const sourceMeeting = withEffectiveSourceMeetingStatus(
    {
      dateText: "July 13, 2026",
      timeText: null,
      section: "All Meetings",
      status: "Upcoming"
    },
    now
  );
  const ambiguousPast = withEffectiveSourceMeetingStatus(
    {
      dateText: "July 13, 2026",
      timeText: null,
      section: "All Meetings",
      status: "Past"
    },
    now
  );
  const storedMeeting = withEffectiveMeetingStatus(
    {
      date_text: "July 13, 2026",
      time_text: null,
      meeting_datetime: "2026-07-13T07:00:00.000Z",
      section: "Upcoming Meetings",
      status: "Upcoming"
    },
    now
  );

  assert.equal(sourceMeeting.status, "Upcoming");
  assert.equal(ambiguousPast.status, "Upcoming");
  assert.equal(ambiguousPast.section, "Upcoming Meetings");
  assert.equal(storedMeeting.status, "Upcoming");
  assert.deepEqual(civicDayBounds(now), {
    startIso: "2026-07-13T07:00:00.000Z",
    nextStartIso: "2026-07-14T07:00:00.000Z"
  });
});
