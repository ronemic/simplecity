import assert from "node:assert/strict";
import test from "node:test";
import { displayMeetingText, displayMeetingTitle, displayMeetingType } from "@/lib/utils/meetingDisplay";

test("meeting labels strip repetitive not applicable text and recover the body name", () => {
  const noisy =
    "BOARD OF SUPERVISORS 500 County Center Chambers, 1st Fl. SPECIAL MEETING OF THE BOARD OF SUPERVISORS https://smcgov.zoom.us/j/86130548317 Not applicable Not applicable Not applicable";

  assert.equal(displayMeetingTitle({ title: noisy, meeting_type: noisy }), "Board of Supervisors");
  assert.equal(displayMeetingType({ title: noisy, meeting_type: noisy }), "Board of Supervisors");
});

test("meeting label helper falls back cleanly when the label is only noise", () => {
  assert.equal(displayMeetingText("Not applicable Not applicable"), "Not listed");
});
