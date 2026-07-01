import assert from "node:assert/strict";
import test from "node:test";
import { getAdjacentMeetings } from "@/lib/utils/meetingNavigation";
import type { MeetingRow } from "@/lib/types";

function meeting(id: string): MeetingRow {
  return {
    id,
    external_id: null,
    jurisdiction_name: null,
    jurisdiction_slug: null,
    platform: null,
    title: id,
    meeting_type: null,
    date_text: null,
    meeting_datetime: null,
    section: null,
    status: null,
    source_type: null,
    source_url: null,
    row_text: null,
    has_html_agenda: null,
    has_pdf: null,
    llm_input_text: null,
    public_comments_input_text: null,
    source_hash: null,
    summarized_source_hash: null,
    cards_generated_at: null,
    extraction_notes: null,
    raw: null,
    scraped_at: null,
    created_at: null,
    updated_at: null
  };
}

test("finds adjacent meetings in newest-to-oldest order", () => {
  const result = getAdjacentMeetings([meeting("newest"), meeting("current"), meeting("oldest")], "current");

  assert.equal(result.newerMeeting?.id, "newest");
  assert.equal(result.olderMeeting?.id, "oldest");
});

test("returns null adjacent meetings at list edges", () => {
  const meetings = [meeting("newest"), meeting("oldest")];

  assert.equal(getAdjacentMeetings(meetings, "newest").newerMeeting, null);
  assert.equal(getAdjacentMeetings(meetings, "oldest").olderMeeting, null);
  assert.deepEqual(getAdjacentMeetings(meetings, "missing"), {
    newerMeeting: null,
    olderMeeting: null
  });
});
