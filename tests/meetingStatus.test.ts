import assert from "node:assert/strict";
import test from "node:test";
import { effectiveMeetingStatus, withEffectiveMeetingStatus } from "@/lib/utils/meetingStatus";

const now = new Date("2026-07-13T20:00:00.000Z");

test("treats a stored upcoming meeting as past after its start time", () => {
  assert.equal(effectiveMeetingStatus("Upcoming", "2026-06-16T16:00:00.000Z", now), "Past");
});

test("keeps future and undated upcoming meetings upcoming", () => {
  assert.equal(effectiveMeetingStatus("Upcoming", "2026-07-14T16:00:00.000Z", now), "Upcoming");
  assert.equal(effectiveMeetingStatus("Upcoming", null, now), "Upcoming");
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
