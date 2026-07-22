import assert from "node:assert/strict";
import test from "node:test";
import { buildLlmReadyMeeting } from "@/lib/scraper/prepareLlmInput";
import type { PrimeGovMeeting } from "@/lib/types";

function repeatSentence(sentence: string, count: number) {
  return Array.from({ length: count }, () => sentence).join(" ");
}

test("falls back to packet text when the agenda document is unreadable", async () => {
  const packetText = repeatSentence(
    "Item 7 approves a $100 contract for playground repairs at Central Park.",
    12
  );
  const meeting: PrimeGovMeeting = {
    section: "Upcoming Meetings",
    title: "City Council",
    dateText: "June 13, 2026",
    timeText: "7:00 PM",
    meetingType: "City Council",
    rowText: "City Council June 13, 2026 7:00 PM Agenda Packet",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [
      {
        type: "Agenda",
        label: "Agenda",
        url: "https://city.example/agenda.pdf",
        extractedText: "Scanned"
      },
      {
        type: "Agenda Packet",
        label: "Agenda Packet",
        url: "https://city.example/packet.pdf",
        extractedText: packetText
      }
    ]
  };

  const prepared = await buildLlmReadyMeeting(meeting);

  assert.equal(prepared.sourceType, "Agenda Packet");
  assert.equal(prepared.sourceUrl, "https://city.example/packet.pdf");
  assert.match(prepared.llmInputText, /playground repairs/);
  assert.ok(
    prepared.extractionNotes.some((note) => note.includes("Agenda document had little"))
  );
});

test("uses Accessible Agenda text before packet text for Mountain View", async () => {
  const accessibleAgendaText = repeatSentence(
    "Item 4 considers a safe routes project near downtown Mountain View.",
    12
  );
  const packetText = repeatSentence(
    "This large packet contains backup material for many agenda items.",
    12
  );
  const meeting: PrimeGovMeeting = {
    jurisdictionSlug: "mountain-view",
    section: "Upcoming Meetings",
    title: "City Council",
    dateText: "6/23/2026",
    timeText: "6:30 PM",
    meetingType: "City Council",
    rowText: "City Council 6/23/2026 6:30 PM Agenda Accessible Agenda Agenda Packet",
    hasHtmlAgenda: true,
    hasPdf: true,
    documents: [
      {
        type: "Agenda",
        label: "Agenda",
        url: "https://mountainview.example/agenda.pdf",
        extractedText: "Scanned"
      },
      {
        type: "Accessible Agenda",
        label: "Accessible Agenda",
        url: "https://mountainview.example/accessible-agenda",
        localPath: "/tmp/accessible-agenda.html",
        extractedText: accessibleAgendaText
      },
      {
        type: "Agenda Packet",
        label: "Agenda Packet",
        url: "https://mountainview.example/packet.pdf",
        extractedText: packetText
      }
    ]
  };

  const prepared = await buildLlmReadyMeeting(meeting);

  assert.equal(prepared.sourceType, "Accessible Agenda HTML");
  assert.equal(prepared.sourceUrl, "https://mountainview.example/accessible-agenda");
  assert.match(prepared.llmInputText, /safe routes project/);
  assert.doesNotMatch(prepared.llmInputText, /large packet/);
});

test("structures an unnumbered current agenda and excludes historical packet pages", async () => {
  const packetText = `
CITY COMMISSION SPECIAL MEETING AGENDA
Residents may email comments to clerk@city.example.
CALL TO ORDER AND ROLL CALL
DISCUSSION AND ACTION
Draft Committee Workplan
Recommendation:
1. Receive an informational report.
1. Provide direction and consider adoption of the workplan.
Public Hearing on Sewer Service Charges
Recommendation:
1. Receive an informational report on the charges.
1. The regional board will consider approval at a later meeting.
ADJOURNMENT
This packet is available 72 hours before the meeting.
COMMITTEE REPORTS 3.1
CITY COMMISSION STAFF REPORT
SUBJECT: Historical contract award
Recommendation: Approve the historical contract.
${repeatSentence("Historical supporting material.", 20)}
`;
  const meeting: PrimeGovMeeting = {
    externalId: "commission-2026-07-14",
    section: "Upcoming Meetings",
    title: "Commission",
    dateText: "July 14, 2026",
    meetingType: "Commission",
    rowText: "Commission July 14, 2026 Agenda Packet",
    status: "Upcoming",
    sourceUrl: "https://city.example/agenda",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [
      {
        type: "Agenda Packet",
        label: "Agenda Packet",
        url: "https://city.example/packet.pdf",
        extractedText: packetText
      }
    ]
  };

  const prepared = await buildLlmReadyMeeting(meeting);

  assert.deepEqual(
    prepared.items?.map((item) => item.title),
    ["Draft Committee Workplan", "Public Hearing on Sewer Service Charges"]
  );
  assert.match(prepared.llmInputText, /clerk@city\.example/);
  assert.doesNotMatch(prepared.llmInputText, /Historical contract award/);
  assert.doesNotMatch(prepared.llmInputText, /72 hours before/);
});

test("builds agenda items before enriching their attachments for any jurisdiction", async () => {
  const agendaText = `
CITY COUNCIL AGENDA
Residents may comment in person during the meeting. ${repeatSentence(
    "The agenda lists the current business before the council.",
    8
  )}
1. CALL TO ORDER
2. Central Park playground repair contract
Recommendation: Approve the playground repair contract.
3. ADJOURNMENT
`;
  const attachmentText = repeatSentence(
    "The supporting document provides the playground repair schedule and funding details.",
    12
  );
  const meeting: PrimeGovMeeting = {
    externalId: "foster-city-council-2026-07-21",
    jurisdictionSlug: "foster-city",
    section: "Upcoming Meetings",
    title: "City Council",
    dateText: "July 21, 2026",
    meetingType: "City Council",
    rowText: "City Council July 21, 2026 Agenda",
    status: "Upcoming",
    sourceUrl: "https://city.example/agenda.pdf",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [
      {
        type: "Agenda",
        label: "Agenda",
        url: "https://city.example/agenda.pdf",
        extractedText: agendaText
      },
      {
        type: "Attachment",
        label: "Playground Contract Staff Report",
        url: "https://city.example/playground-staff-report.pdf",
        extractedText: attachmentText,
        agendaItemNumber: "2"
      }
    ]
  };

  const prepared = await buildLlmReadyMeeting(meeting);

  assert.deepEqual(prepared.items?.map((item) => item.agendaNumber), ["2"]);
  assert.equal(prepared.items?.[0].attachments?.length, 1);
  assert.match(prepared.llmInputText, /playground repair schedule and funding details/);
  assert.ok(
    prepared.extractionNotes.some((note) =>
      note.includes("Included item-aware context from 1 agenda attachment")
    )
  );
});
