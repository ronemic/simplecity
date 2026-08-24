import assert from "node:assert/strict";
import test from "node:test";
import {
  collapseDocumentRowsByConflictTarget,
  compactMeetingRawForStorage,
  documentExtractionFieldsForStorage,
  documentExtractedTextForStorage,
  documentWriteBatches,
  isTransientSupabaseWriteError,
  restoreArchivedDocumentExtractions,
  upsertMeetings,
  retryTransientSupabaseWrite,
  uniqueExistingExternalIdsByMeetingDetailsUrl,
  uniqueMeetingDetailsIdentityUrls
} from "@/lib/db/upsertMeetings";
import type { LlmReadyMeeting, PrimeGovDocument } from "@/lib/types";

test("restores archived extraction text after a transient current download miss", async () => {
  const document: PrimeGovDocument = {
    type: "Minutes" as const,
    label: "Minutes",
    url: "https://example.com/minutes.pdf",
    downloadError: "HTTP 503"
  };
  const supabase = {
    from(table: string) {
      assert.equal(table, "documents");
      return {
        select() {
          return {
            async in(column: string, urls: string[]) {
              assert.equal(column, "source_url");
              assert.deepEqual(urls, [document.url]);
              return {
                data: [{
                  source_url: document.url,
                  extracted_text:
                    "The board approved the official minutes and recorded the vote unanimously.",
                  extraction_character_count: 76,
                  is_scanned: false
                }],
                error: null
              };
            }
          };
        }
      };
    }
  };

  const restored = await restoreArchivedDocumentExtractions(
    supabase as never,
    [{ documents: [document] }]
  );

  assert.equal(restored, 1);
  assert.match(document.extractedText || "", /approved the official minutes/);
  assert.equal(document.downloadError, undefined);
});

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

test("omits empty extraction fields so a transient failure cannot erase archived text", () => {
  assert.deepEqual(documentExtractionFieldsForStorage("Minutes", null), {});
  assert.deepEqual(
    documentExtractionFieldsForStorage("Minutes", null, {
      extracted_text: "Archived approval text.",
      extraction_character_count: 23
    }),
    {
      extracted_text: "Archived approval text.",
      extraction_character_count: 23
    }
  );
  assert.deepEqual(documentExtractionFieldsForStorage("Minutes", "Approved 5-0."), {
    extracted_text: "Approved 5-0.",
    extraction_character_count: 13
  });
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

test("collapses documents sharing one URL so a batched upsert cannot touch a row twice", () => {
  const rows = collapseDocumentRowsByConflictTarget([
    { source_url: "https://city.example/doc.pdf", type: "Minutes", is_scanned: false },
    { source_url: "https://city.example/other.pdf", type: "Agenda", is_scanned: false },
    { source_url: "https://city.example/doc.pdf", type: "Accessible Minutes", is_scanned: true }
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.source_url), [
    "https://city.example/doc.pdf",
    "https://city.example/other.pdf"
  ]);
  assert.equal(rows[0].type, "Accessible Minutes");
  assert.equal(rows[0].is_scanned, true);
});

test("keeps extracted text a duplicate URL supplied earlier when the later row omits it", () => {
  const [row] = collapseDocumentRowsByConflictTarget([
    {
      source_url: "https://city.example/doc.pdf",
      type: "Minutes",
      ...documentExtractionFieldsForStorage("Minutes", "Approved 5-0.")
    },
    {
      source_url: "https://city.example/doc.pdf",
      type: "Accessible Minutes",
      ...documentExtractionFieldsForStorage("Accessible Minutes", null)
    }
  ]);

  assert.equal(row.type, "Accessible Minutes");
  assert.equal(row.extracted_text, "Approved 5-0.");
  assert.equal(row.extraction_character_count, 13);
});

test("bounds document write batches by row count and payload size", () => {
  const small = Array.from({ length: 25 }, (_, index) => ({
    source_url: `https://city.example/${index}.pdf`,
    extracted_text: "short"
  }));
  assert.deepEqual(documentWriteBatches(small).map((batch) => batch.length), [10, 10, 5]);

  const heavy = [
    { source_url: "a", extracted_text: "x".repeat(700_000) },
    { source_url: "b", extracted_text: "x".repeat(700_000) },
    { source_url: "c", extracted_text: "x".repeat(100) }
  ];
  assert.deepEqual(documentWriteBatches(heavy).map((batch) => batch.length), [1, 2]);
});

test("ships a single oversized document row rather than dropping it", () => {
  const batches = documentWriteBatches([
    { source_url: "minutes", extracted_text: "x".repeat(2_000_000) },
    { source_url: "agenda", extracted_text: "x".repeat(10) }
  ]);

  assert.deepEqual(batches.map((batch) => batch.length), [1, 1]);
  assert.equal(batches[0][0].source_url, "minutes");
});

type CapturedWrite = { table: string; payload: unknown; options?: unknown };

function fakeSupabaseClient(writes: CapturedWrite[], summaryHashesSupported = true) {
  function chainFor(table: string) {
    let outcome: Record<string, unknown> = { data: [], error: null, count: 0 };
    const chain = {
      select: (columns?: string) => {
        if (
          table === "meetings" &&
          columns?.includes("summary_source_hash") &&
          !summaryHashesSupported
        ) {
          outcome = {
            data: null,
            error: { message: "Could not find the summary_source_hash column", code: "PGRST204" }
          };
        }
        return chain;
      },
      limit: () => chain,
      eq: () => chain,
      in: () => chain,
      single: async () => outcome,
      upsert: (payload: unknown, options?: unknown) => {
        writes.push({ table, payload, options });
        if (table === "meetings") {
          outcome = {
            data: {
              id: "meeting-1",
              summarized_source_hash: null,
              summarized_summary_source_hash: null
            },
            error: null
          };
        }
        return chain;
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(outcome).then(resolve)
    };
    return chain;
  }

  return { from: (table: string) => chainFor(table) } as unknown as Parameters<typeof upsertMeetings>[0];
}

function meetingWithDocuments(documents: LlmReadyMeeting["documents"]): LlmReadyMeeting {
  return {
    id: "council",
    section: "Past Meetings",
    title: "City Council",
    dateText: "Jul 20, 2026",
    meetingType: "City Council",
    rowText: "City Council Jul 20, 2026",
    status: "Past",
    sourceType: "Agenda PDF",
    sourceUrl: "https://city.example/meeting/1",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents,
    extractionNotes: [],
    llmInputText: "Agenda text.",
    publicCommentsInputText: null
  } as LlmReadyMeeting;
}

test("writes a meeting's documents as one batched upsert instead of one request per document", async () => {
  const writes: CapturedWrite[] = [];
  const documents = Array.from({ length: 6 }, (_, index) => ({
    type: "Attachment",
    label: `Attachment ${index}`,
    url: `https://city.example/doc-${index}.pdf`,
    extractedText: "Short official text."
  })) as LlmReadyMeeting["documents"];

  await upsertMeetings(fakeSupabaseClient(writes), [meetingWithDocuments(documents)]);

  const documentWrites = writes.filter((write) => write.table === "documents");
  assert.equal(documentWrites.length, 1);
  assert.equal((documentWrites[0].payload as unknown[]).length, 6);
  assert.deepEqual(documentWrites[0].options, { onConflict: "source_url" });
});

test("collapses duplicate document URLs before the batched upsert reaches Postgres", async () => {
  const writes: CapturedWrite[] = [];
  const sharedUrl = "https://city.example/minutes.pdf";
  const documents = [
    { type: "Minutes", label: "Minutes", url: sharedUrl, extractedText: "Approved 5-0." },
    { type: "Accessible Minutes", label: "Accessible Minutes", url: sharedUrl },
    { type: "Agenda", label: "Agenda", url: "https://city.example/agenda.pdf" }
  ] as LlmReadyMeeting["documents"];

  await upsertMeetings(fakeSupabaseClient(writes), [meetingWithDocuments(documents)]);

  const rows = writes.find((write) => write.table === "documents")?.payload as Array<
    Record<string, unknown>
  >;
  assert.equal(rows.length, 2);

  const merged = rows.find((row) => row.source_url === sharedUrl);
  assert.equal(merged?.type, "Accessible Minutes");
  // The later duplicate carries no text of its own; the earlier row's text survives.
  assert.equal(merged?.extracted_text, "Approved 5-0.");
});

test("keeps meeting upserts compatible until summary hash columns are migrated", async () => {
  const writes: CapturedWrite[] = [];
  await upsertMeetings(
    fakeSupabaseClient(writes, false),
    [meetingWithDocuments([])]
  );

  const meetingWrite = writes.find((write) => write.table === "meetings");
  const payload = meetingWrite?.payload as Record<string, unknown>;
  assert.equal("summary_source_hash" in payload, false);
  assert.equal("summarized_summary_source_hash" in payload, false);
});
