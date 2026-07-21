import assert from "node:assert/strict";
import test from "node:test";
import {
  compactMeetingRawForStorage,
  documentExtractedTextForStorage,
  uniqueExistingExternalIdsByMeetingDetailsUrl,
  uniqueMeetingDetailsIdentityUrls
} from "@/lib/db/upsertMeetings";
import type { LlmReadyMeeting } from "@/lib/types";

test("does not treat a shared Menlo Park section URL as a meeting identity", () => {
  const sectionUrl = "https://www.menlopark.gov/Agendas-and-minutes#section-3";

  assert.deepEqual(
    uniqueMeetingDetailsIdentityUrls([
      { meetingDetailsUrl: sectionUrl, sectionUrl },
      { meetingDetailsUrl: sectionUrl, sectionUrl }
    ]),
    []
  );
});

test("does not reconcile a meeting details URL shared by multiple incoming meetings", () => {
  const detailsUrl = "https://example.com/meeting/shared";

  assert.deepEqual(
    uniqueMeetingDetailsIdentityUrls([
      { meetingDetailsUrl: detailsUrl, sectionUrl: "https://example.com/calendar" },
      { meetingDetailsUrl: detailsUrl, sectionUrl: "https://example.com/calendar" }
    ]),
    []
  );
});

test("allows a unique event-specific meeting details URL", () => {
  const detailsUrl = "https://www.cityofepa.org/event/2";

  assert.deepEqual(
    uniqueMeetingDetailsIdentityUrls([
      { meetingDetailsUrl: detailsUrl, sectionUrl: "https://www.cityofepa.org/calendar" }
    ]),
    [detailsUrl]
  );
});

test("stores large extracted source text only in its dedicated database columns", () => {
  const meeting = {
    title: "Council",
    meetingType: "Council",
    section: "Past Meetings",
    dateText: "Jul 1, 2026",
    rowText: "Council",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [{
      type: "Minutes",
      label: "Minutes",
      url: "https://example.test/minutes.pdf",
      extractedText: "large official minutes"
    }],
    llmInputText: "large LLM input",
    publicCommentsInputText: "large comments input",
    items: []
  } as LlmReadyMeeting;

  const raw = compactMeetingRawForStorage(meeting);
  assert.equal(raw.llmInputText, "");
  assert.equal(raw.publicCommentsInputText, null);
  assert.equal(raw.documents[0].extractedText, null);
  assert.equal(meeting.documents[0].extractedText, "large official minutes");
});

test("bounds oversized extracted documents without dropping useful minutes text", () => {
  const oversized = "x".repeat(2_500_000);
  assert.equal(documentExtractedTextForStorage("Agenda", oversized)?.length, 500_000);
  assert.equal(documentExtractedTextForStorage("Minutes", oversized)?.length, 2_000_000);
  assert.equal(documentExtractedTextForStorage("Minutes", null), null);
});

test("does not select an arbitrary external id when stored rows share a details URL", () => {
  const sharedUrl = "https://www.menlopark.gov/Agendas-and-minutes#section-3";
  const uniqueUrl = "https://example.com/meeting/unique";
  const externalIds = uniqueExistingExternalIdsByMeetingDetailsUrl([
    { external_id: "february", meeting_details_url: sharedUrl },
    { external_id: "june", meeting_details_url: sharedUrl },
    { external_id: "unique", meeting_details_url: uniqueUrl }
  ]);

  assert.equal(externalIds.has(sharedUrl), false);
  assert.equal(externalIds.get(uniqueUrl), "unique");
});
