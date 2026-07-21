import assert from "node:assert/strict";
import test from "node:test";
import { shouldDownloadIqm2DocumentForWindow } from "@/lib/sources/iqm2";
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
