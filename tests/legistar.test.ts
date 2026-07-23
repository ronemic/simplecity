import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLegistarLink,
  legistarDocumentDownloadPriority,
  MAX_LEGISTAR_UPCOMING_ATTACHMENTS_PER_MEETING,
  selectLegistarDocumentsForDownload,
  shouldDownloadLegistarDocumentForWindow,
  shouldEnrichLegistarAgendaAttachments,
  shouldEnrichLegistarMeetingAttachments
} from "@/lib/sources/legistar";
import type { DocumentType } from "@/lib/types";

function document(type: DocumentType) {
  return { type, label: type, url: `https://example.test/${type}` };
}

test("deep Legistar refreshes skip packets and item attachments", () => {
  assert.equal(shouldDownloadLegistarDocumentForWindow(document("Agenda"), 3), true);
  assert.equal(shouldDownloadLegistarDocumentForWindow(document("Minutes"), 3), true);
  assert.equal(shouldDownloadLegistarDocumentForWindow(document("Agenda Packet"), 3), false);
  assert.equal(shouldDownloadLegistarDocumentForWindow(document("Document"), 3), false);
  assert.equal(shouldDownloadLegistarDocumentForWindow(document("Agenda Packet"), 1), true);
});

test("prioritizes minutes and agendas ahead of optional Legistar attachments", () => {
  const agenda = document("Agenda");
  const minutes = document("Minutes");
  const packet = document("Agenda Packet");
  const attachment = { ...document("Attachment"), isAgendaItemAttachment: true };
  const ordered = [attachment, packet, agenda, minutes].sort(
    (left, right) =>
      legistarDocumentDownloadPriority(left) - legistarDocumentDownloadPriority(right)
  );

  assert.deepEqual(ordered.map((item) => item.type), [
    "Minutes",
    "Agenda",
    "Agenda Packet",
    "Attachment"
  ]);
});

test("nightly Legistar downloads keep past minutes but skip past item attachments", () => {
  const minutes = document("Minutes");
  const attachment = { ...document("Attachment"), isAgendaItemAttachment: true };
  const selected = selectLegistarDocumentsForDownload(
    {
      section: "Past Meetings",
      status: "Past",
      documents: [attachment, minutes]
    },
    1
  );

  assert.deepEqual(selected, [minutes]);
});

test("nightly Legistar downloads bound attachments for upcoming meetings", () => {
  const minutes = document("Minutes");
  const attachments = Array.from(
    { length: MAX_LEGISTAR_UPCOMING_ATTACHMENTS_PER_MEETING + 10 },
    (_, index) => ({
      ...document("Attachment"),
      url: `https://example.test/attachment-${index}`,
      isAgendaItemAttachment: true
    })
  );
  const selected = selectLegistarDocumentsForDownload(
    {
      section: "Upcoming Meetings",
      status: "Upcoming",
      documents: [...attachments, minutes]
    },
    1
  );

  assert.equal(
    selected.filter((item) => item.isAgendaItemAttachment).length,
    MAX_LEGISTAR_UPCOMING_ATTACHMENTS_PER_MEETING
  );
  assert.equal(selected.includes(minutes), true);
});

test("Legistar attachment enrichment defaults on and honors the universal switch", () => {
  assert.equal(shouldEnrichLegistarAgendaAttachments({}), true);
  assert.equal(
    shouldEnrichLegistarAgendaAttachments({ enrichAgendaAttachments: true, enrichLegislation: false }),
    true
  );
  assert.equal(
    shouldEnrichLegistarAgendaAttachments({ enrichAgendaAttachments: false, enrichLegislation: true }),
    false
  );
  assert.equal(shouldEnrichLegistarAgendaAttachments({ enrichLegislation: false }), false);
});

test("nightly Legistar enrichment skips past legislation unless explicitly requested", () => {
  const pastMeeting = { section: "Past Meetings" as const, status: "Past" as const };
  const upcomingMeeting = {
    section: "Upcoming Meetings" as const,
    status: "Upcoming" as const
  };

  assert.equal(shouldEnrichLegistarMeetingAttachments(pastMeeting, {}), false);
  assert.equal(shouldEnrichLegistarMeetingAttachments(upcomingMeeting, {}), true);
  assert.equal(
    shouldEnrichLegistarMeetingAttachments(pastMeeting, { enrichLegislation: true }),
    true
  );
});

test("classifies Mountain View Legistar document labels by visible text first", () => {
  assert.equal(
    classifyLegistarLink(
      "Accessible Agenda",
      "https://mountainview.legistar.com/View.ashx?M=A&ID=1&GUID=abc"
    ),
    "Accessible Agenda"
  );
  assert.equal(
    classifyLegistarLink(
      "Agenda Packet",
      "https://mountainview.legistar.com/View.ashx?M=A&ID=1&GUID=abc"
    ),
    "Agenda Packet"
  );
  assert.equal(
    classifyLegistarLink(
      "Meeting Cancellation Notice",
      "https://mountainview.legistar.com/View.ashx?M=A&ID=1&GUID=abc"
    ),
    "Notice of Cancellation"
  );
  assert.equal(
    classifyLegistarLink(
      "",
      "https://mountainview.legistar.com/View.ashx?M=A&ID=1&GUID=abc"
    ),
    "Document"
  );
});

test("classifies San Francisco Legistar transcript links from the calendar table", () => {
  assert.equal(
    classifyLegistarLink(
      "Transcript",
      "https://sfgov.legistar.com/Transcript.aspx?ID=1&GUID=abc"
    ),
    "Captions"
  );
});
