import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyIqm2Link,
  shouldIgnoreIqm2Link,
  extractIqm2AgendaItemAttachments,
  shouldDownloadIqm2DocumentForWindow,
  extractVisibleIqm2MeetingsWithRetry
} from "@/lib/sources/iqm2";
import type { Page } from "playwright";
import { getJurisdictionBySlug } from "@/lib/config/jurisdictions";
import type { DocumentType } from "@/lib/types";

function document(type: DocumentType) {
  return { type, label: type, url: `https://example.test/${type}` };
}

test("deep IQM2 refreshes skip packets when a standalone agenda is available", () => {
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Agenda"), 3), true);
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Minutes"), 3), true);
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Agenda Packet"), 3, [document("Agenda")]), false);
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Document"), 3), false);
});

test("deep IQM2 refresh keeps the HIV Executive Committee packet without a standalone agenda", () => {
  const packet = document("Agenda Packet");
  const documents = [packet, document("Minutes"), document("Meeting Details")];
  assert.equal(shouldDownloadIqm2DocumentForWindow(packet, 3, documents), true);
  assert.equal(shouldDownloadIqm2DocumentForWindow(
    { ...packet, isAgendaItemAttachment: true }, 3, documents
  ), false);
});

test("normal IQM2 refreshes retain all candidate document types", () => {
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Agenda Packet"), 1), true);
  assert.equal(shouldDownloadIqm2DocumentForWindow(document("Document"), 1), true);
});

test("retries IQM2 extraction when a See more click finishes navigating late", async () => {
  const jurisdiction = getJurisdictionBySlug("santa-clara-county");
  assert.ok(jurisdiction);
  let evaluations = 0;
  let loadWaits = 0;
  let timeoutWaits = 0;
  const page = {
    evaluate: async () => {
      evaluations += 1;
      if (evaluations === 1) {
        throw new Error("Execution context was destroyed, most likely because of a navigation");
      }
      return evaluations === 2 ? undefined : [];
    },
    waitForLoadState: async () => {
      loadWaits += 1;
    },
    waitForTimeout: async () => {
      timeoutWaits += 1;
    }
  } as unknown as Page;
  const logs: string[] = [];

  assert.deepEqual(
    await extractVisibleIqm2MeetingsWithRetry(page, jurisdiction, (message) => logs.push(message)),
    []
  );
  assert.equal(loadWaits, 1);
  assert.equal(timeoutWaits, 1);
  assert.match(logs[0], /retrying/);
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


test("IQM2 motion and item pages containing agenda in their title are not agenda documents", () => {
  for (const endpoint of ["Detail_Motion", "Detail_LegiFile"]) {
    const url = `https://sccgov.iqm2.com/Citizens/${endpoint}.aspx?ID=446014`;
    assert.equal(classifyIqm2Link("Propose future agenda items.", url), "Other");
    assert.equal(shouldIgnoreIqm2Link("Propose future agenda items.", url), true);
  }
  const agenda = "https://sccgov.iqm2.com/Citizens/FileOpen.aspx?Type=1&ID=15907";
  assert.equal(classifyIqm2Link("Agenda", agenda), "Agenda");
  assert.equal(shouldIgnoreIqm2Link("Agenda", agenda), false);
});
