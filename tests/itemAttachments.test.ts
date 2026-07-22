import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAgendaItemAttachment,
  mergeDiscoveredAgendaItemAttachments
} from "@/lib/scraper/itemAttachments";
import type { PrimeGovMeeting } from "@/lib/types";

function meeting(): PrimeGovMeeting {
  return {
    externalId: "meeting-1",
    section: "Upcoming Meetings",
    title: "Council",
    dateText: "Jul 21, 2026",
    meetingType: "Council",
    rowText: "Council",
    sourceUrl: "https://portal.test/meeting/1",
    hasHtmlAgenda: true,
    hasPdf: false,
    documents: [],
    items: []
  };
}

test("classifies common item attachment labels", () => {
  assert.equal(classifyAgendaItemAttachment("Staff Report"), "Staff Report");
  assert.equal(classifyAgendaItemAttachment("Attachment A - Agreement"), "Contract");
  assert.equal(classifyAgendaItemAttachment("Resolution 2026-4"), "Resolution");
  assert.equal(classifyAgendaItemAttachment("Public correspondence"), "Public Comment");
});

test("merges every discovered attachment into both the meeting and its item", () => {
  const value = meeting();
  const result = mergeDiscoveredAgendaItemAttachments(value, [{
    agendaNumber: "7.A",
    title: "Approve the agreement",
    sourceUrl: "https://portal.test/item/7a",
    attachments: [
      { label: "Staff Report", url: "https://portal.test/files/staff.pdf" },
      { label: "Attachment A - Agreement", url: "https://portal.test/files/agreement.pdf" },
      { label: "Duplicate", url: "https://portal.test/files/staff.pdf" }
    ]
  }]);

  assert.equal(result.attachmentsAdded, 2);
  assert.equal(value.documents.length, 2);
  assert.equal(value.items?.length, 1);
  assert.equal(value.items?.[0].attachments?.length, 2);
  assert.ok(value.documents.every((document) => document.isAgendaItemAttachment));
  assert.deepEqual(value.documents.map((document) => document.agendaItemNumber), ["7.A", "7.A"]);
});

test("reuses an existing document and item without duplicating either", () => {
  const value = meeting();
  value.documents.push({
    type: "Document",
    label: "Staff Report",
    url: "https://portal.test/files/staff.pdf"
  });
  value.items = [{
    externalId: "7a",
    fileNumber: null,
    agendaNumber: "7.A.",
    itemType: null,
    title: "Approve the agreement",
    action: null,
    result: null,
    sourceUrl: "https://portal.test/item/7a",
    rowText: "7.A Approve the agreement",
    attachments: []
  }];

  const result = mergeDiscoveredAgendaItemAttachments(value, [{
    agendaNumber: "7.A",
    title: "Approve the agreement",
    attachments: [{ label: "Staff Report", url: "https://portal.test/files/staff.pdf" }]
  }]);

  assert.equal(result.attachmentsAdded, 0);
  assert.equal(value.documents.length, 1);
  assert.equal(value.items.length, 1);
  assert.equal(value.items[0].attachments?.length, 1);
  assert.equal(value.documents[0].type, "Staff Report");
});
