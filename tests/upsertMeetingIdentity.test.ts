import assert from "node:assert/strict";
import test from "node:test";
import {
  compactMeetingRawForStorage,
  documentExtractedTextForStorage,
  isTransientSupabaseWriteError,
  retryTransientSupabaseWrite,
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
    htmlAgendaText: "large HTML agenda",
    detailText: "large detail page",
    items: [{
      externalId: "item-1",
      fileNumber: null,
      agendaNumber: "1",
      itemType: null,
      title: "Large item",
      action: null,
      result: null,
      sourceUrl: "https://example.test/item/1",
      rowText: "r".repeat(8_000),
      legislationText: "l".repeat(8_000),
      attachments: [{
        type: "Staff Report",
        label: "Staff report",
        url: "https://example.test/staff-report.pdf",
        extractedText: "large nested staff report"
      }]
    }]
  } as LlmReadyMeeting;

  const raw = compactMeetingRawForStorage(meeting);
  assert.equal(raw.rowText, "");
  assert.equal(raw.htmlAgendaText, null);
  assert.equal(raw.detailText, null);
  assert.equal(raw.llmInputText, "");
  assert.equal(raw.publicCommentsInputText, null);
  assert.equal(raw.documents[0].extractedText, null);
  assert.equal(raw.items?.[0].rowText.length, 4_000);
  assert.equal(raw.items?.[0].legislationText?.length, 4_000);
  assert.equal(raw.items?.[0].attachments?.[0].extractedText, null);
  assert.equal(meeting.documents[0].extractedText, "large official minutes");
  assert.equal(meeting.items?.[0].attachments?.[0].extractedText, "large nested staff report");
});

test("retries transient Supabase timeouts without retrying permanent errors", async () => {
  const waits: number[] = [];
  let attempts = 0;
  const recovered = await retryTransientSupabaseWrite(
    async () => {
      attempts += 1;
      return attempts < 3
        ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }
        : { data: { id: "meeting-1" }, error: null };
    },
    {
      delaysMs: [10, 20],
      sleep: async (milliseconds) => { waits.push(milliseconds); }
    }
  );

  assert.deepEqual(recovered, { data: { id: "meeting-1" }, error: null });
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [10, 20]);
  assert.equal(isTransientSupabaseWriteError({ message: "permission denied for table meetings" }), false);

  let permanentAttempts = 0;
  await retryTransientSupabaseWrite(
    async () => {
      permanentAttempts += 1;
      return { data: null, error: { message: "permission denied for table meetings" } };
    },
    { delaysMs: [10, 20], sleep: async () => undefined }
  );
  assert.equal(permanentAttempts, 1);
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
