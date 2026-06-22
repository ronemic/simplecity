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
