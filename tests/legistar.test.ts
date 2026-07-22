import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLegistarLink,
  shouldDownloadLegistarDocumentForWindow,
  shouldEnrichLegistarAgendaAttachments
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
