import assert from "node:assert/strict";
import test from "node:test";
import {
  extractIqm2AgendaItemAttachments,
  shouldDownloadIqm2DocumentForWindow
} from "@/lib/sources/iqm2";
import type { DocumentType } from "@/lib/types";

function document(type: DocumentType) {
  return { type, label: type, url: `https://example.test/${type}` };
}

test("deep IQM2 refreshes download only meeting agendas and minutes", () => {
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Agenda"), 3), true);
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Minutes"), 3), true);
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Agenda Packet"), 3), false);
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Document"), 3), false);
});

test("normal IQM2 refreshes retain all candidate document types", () => {
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Agenda Packet"), 1), true);
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Document"), 1), true);
});

test("associates every IQM2 document row with the preceding agenda item", () => {
  const discoveries = extractIqm2AgendaItemAttachments([
    {
      cells: ["", "5.", "Discuss the workplan"],
      rowText: "5. Discuss the workplan",
      links: [{ label: "Discuss the workplan", url: "https://iqm2.test/Detail_LegiFile.aspx?ID=5" }]
    },
    {
      cells: ["", "", "document", "Report Printout"],
      rowText: "document Report Printout",
      links: [{ label: "Report Printout", url: "https://iqm2.test/FileOpen.aspx?Type=30&ID=10" }]
    },
    {
      cells: ["", "", "document", "Exhibit A"],
      rowText: "document Exhibit A",
      links: [{ label: "Exhibit A", url: "https://iqm2.test/FileOpen.aspx?Type=30&ID=11" }]
    },
    {
      cells: ["", "6.", "Receive a report"],
      rowText: "6. Receive a report",
      links: []
    }
  ], "https://iqm2.test/Detail_Meeting.aspx?ID=1");

  assert.equal(discoveries.length, 1);
  assert.equal(discoveries[0].agendaNumber, "5");
  assert.equal(discoveries[0].attachments.length, 2);
  assert.equal(discoveries[0].sourceUrl, "https://iqm2.test/Detail_LegiFile.aspx?ID=5");
});
