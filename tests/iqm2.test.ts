import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyIqm2Link,
  shouldIgnoreIqm2Link,
  extractIqm2AgendaItemAttachments,
  shouldDownloadIqm2DocumentForWindow,
  retryIqm2PortalLoad
} from "@/lib/sources/iqm2";
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

test("IQM2 portal loading retries one transient failure", async () => {
  let attempts = 0;
  const logs: string[] = [];
  const result = await retryIqm2PortalLoad(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary navigation timeout");
    return "loaded";
  }, (message) => logs.push(message));

  assert.equal(result, "loaded");
  assert.equal(attempts, 2);
  assert.deepEqual(logs, ["IQM2 portal did not load on the first attempt; retrying once."]);
});

test("IQM2 portal loading surfaces a repeated failure after two attempts", async () => {
  let attempts = 0;
  await assert.rejects(
    retryIqm2PortalLoad(async () => {
      attempts += 1;
      throw new Error("portal unavailable");
    }),
    /portal unavailable/
  );
  assert.equal(attempts, 2);
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
