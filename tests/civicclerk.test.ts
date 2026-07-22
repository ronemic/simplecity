import assert from "node:assert/strict";
import test from "node:test";
import { getJurisdictionBySlug } from "@/lib/config/jurisdictions";
import {
  buildCivicClerkFileUrl,
  civicClerkFileIdFromControlId,
  civicClerkPlainTextFileUrl,
  classifyCivicClerkFile,
  normalizeCivicClerkEventCards,
  type CivicClerkEventCard
} from "@/lib/sources/civicclerk";
import { buildLlmReadyMeeting } from "@/lib/scraper/prepareLlmInput";

function event(overrides: Partial<CivicClerkEventCard> = {}): CivicClerkEventCard {
  return {
    eventId: "2178",
    eventUrl: "https://losaltosca.portal.civicclerk.com/event/2178/files",
    title: "City Council Regular Meeting",
    bodyName: "City Council",
    dateText: "Jul 14, 2026",
    timeText: "7:00 PM PDT",
    location: "City Council Chambers 1 N. San Antonio Rd. Los Altos, CA 94022",
    agendaPostedText: "July 9, 2026 4:39 PM",
    description: null,
    rowText: "Jul 14, 2026 7:00 PM PDT City Council Regular Meeting City Council",
    ...overrides
  };
}

test("classifies CivicClerk files using labels and item context", () => {
  assert.equal(classifyCivicClerkFile("Agenda Packet", "", "https://example.test/1"), "Agenda Packet");
  assert.equal(classifyCivicClerkFile("Staff Report", "", "https://example.test/2"), "Staff Report");
  assert.equal(classifyCivicClerkFile("Attachment 1", "Adoption of Resolution", "https://example.test/3"), "Attachment");
  assert.equal(classifyCivicClerkFile("Draft", "Notice of Cancellation", "https://example.test/4"), "Notice of Cancellation");
  assert.equal(classifyCivicClerkFile("Meeting Media", "", "https://youtube.com/embed/example"), "Media");
});

test("builds CivicClerk file URLs from dynamically discovered control IDs", () => {
  assert.equal(civicClerkFileIdFromControlId("downloadReportFilesMenu-5457"), "5457");
  assert.equal(civicClerkFileIdFromControlId("downloadAttachmentFilesMenu-8124"), "8124");
  assert.equal(civicClerkFileIdFromControlId("downloadFilesMenu"), null);
  assert.equal(
    buildCivicClerkFileUrl("https://losaltosca.portal.civicclerk.com/", "8872"),
    "https://losaltosca.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=8872,plainText=false)"
  );
  assert.equal(
    civicClerkPlainTextFileUrl(
      "https://losaltosca.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=8872,plainText=false)"
    ),
    "https://losaltosca.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=8872,plainText=true)"
  );
  assert.equal(civicClerkPlainTextFileUrl("https://example.com/file.pdf"), null);
});

test("normalizes separate CivicClerk event IDs without merging same-day meetings", () => {
  const jurisdiction = getJurisdictionBySlug("los-altos");
  assert.ok(jurisdiction);

  const meetings = normalizeCivicClerkEventCards(
    [
      event({ eventId: "5361", title: "City Council Closed Session Meeting", timeText: "6:30 PM PDT" }),
      event(),
      event()
    ],
    jurisdiction,
    Date.parse("2026-07-11T12:00:00-07:00")
  );

  assert.equal(meetings.length, 2);
  assert.deepEqual(meetings.map((meeting) => meeting.externalId), [
    "los-altos-civicclerk-event-5361",
    "los-altos-civicclerk-event-2178"
  ]);
  assert.ok(meetings.every((meeting) => meeting.jurisdictionSlug === "los-altos"));
  assert.ok(meetings.every((meeting) => meeting.platform === "civicclerk"));
  assert.ok(meetings.every((meeting) => meeting.bodyName === "City Council"));
  assert.ok(meetings.every((meeting) => meeting.status === "Upcoming"));
});

test("includes Los Altos item staff-report context through the existing LLM preparation", async () => {
  const jurisdiction = getJurisdictionBySlug("los-altos");
  assert.ok(jurisdiction);
  const [meeting] = normalizeCivicClerkEventCards([event()], jurisdiction);
  meeting.documents = [
    {
      type: "Agenda",
      label: "Agenda",
      url: "https://losaltosca.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=8872,plainText=false)",
      extractedText: "Agenda source text ".repeat(40)
    }
  ];
  const staffReport = {
    type: "Staff Report" as const,
    label: "Staff Report",
    url: "https://losaltosca.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=5428,plainText=false)",
    extractedText: "Staff report context about the agreement and recommended action. ".repeat(12),
    isAgendaItemAttachment: true,
    agendaItemNumber: "3",
    agendaItemTitle: "Adoption of Resolution - Agreement with ADP Workforce Now"
  };
  meeting.documents.push(staffReport);
  meeting.items = [{
    externalId: "los-altos-civicclerk-event-2178-item-3",
    fileNumber: null,
    agendaNumber: "3",
    itemType: null,
    title: "Adoption of Resolution - Agreement with ADP Workforce Now",
    action: null,
    result: null,
    sourceUrl: meeting.sourceUrl || "",
    rowText: "3. Adoption of Resolution - Agreement with ADP Workforce Now Staff Report",
    attachments: [staffReport]
  }];

  const prepared = await buildLlmReadyMeeting(meeting);
  assert.match(prepared.llmInputText, /Linked agenda-item context:/);
  assert.match(prepared.llmInputText, /Staff report context about the agreement/);
  assert.ok(prepared.extractionNotes.some((note) => note.includes("item-aware context")));
});
