import assert from "node:assert/strict";
import test from "node:test";
import {
  isSantaBarbaraPlanningMeeting,
  matchesSantaBarbaraBody,
  normalizeSantaBarbaraBodyView
} from "../lib/utils/santaBarbaraBody";
import type { MeetingRow } from "../lib/types";

function meeting(meetingType: string, title = meetingType) {
  return {
    jurisdiction_slug: "santa-barbara-county",
    meeting_type: meetingType,
    title
  } as MeetingRow;
}

test("Santa Barbara body selection defaults to the final decision-making board", () => {
  assert.equal(normalizeSantaBarbaraBodyView(undefined), "board");
  assert.equal(normalizeSantaBarbaraBodyView("anything-else"), "board");
  assert.equal(normalizeSantaBarbaraBodyView("all"), "all");
  assert.equal(normalizeSantaBarbaraBodyView("planning"), "planning");
});

test("Santa Barbara meetings are separated into Board and Planning Commission views", () => {
  const board = meeting("Board of Supervisors");
  const planning = meeting("County Planning Commission");

  assert.equal(matchesSantaBarbaraBody(board, "board"), true);
  assert.equal(matchesSantaBarbaraBody(board, "all"), true);
  assert.equal(matchesSantaBarbaraBody(board, "planning"), false);
  assert.equal(matchesSantaBarbaraBody(planning, "planning"), true);
  assert.equal(matchesSantaBarbaraBody(planning, "all"), true);
  assert.equal(matchesSantaBarbaraBody(planning, "board"), false);
  assert.equal(isSantaBarbaraPlanningMeeting(planning), true);
});

test("translated Planning Commission labels remain advisory", () => {
  assert.equal(
    isSantaBarbaraPlanningMeeting(meeting("Comisión de Planificación del Condado")),
    true
  );
});
