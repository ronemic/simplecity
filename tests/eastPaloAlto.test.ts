import assert from "node:assert/strict";
import test from "node:test";
import { getJurisdictionBySlug } from "../lib/config/jurisdictions";
import {
  attachCouncilMinutesFromAgendaPackets,
  classifyEastPaloAltoLink,
  normalizeEastPaloAltoRows
} from "../lib/sources/east-palo-alto";

test("classifies East Palo Alto table links by label and column", () => {
  assert.equal(classifyEastPaloAltoLink("Agenda", "Agenda", "", "https://example.test/a.pdf"), "Agenda");
  assert.equal(classifyEastPaloAltoLink("View", "Agenda Packet", "", "https://example.test/p.pdf"), "Agenda Packet");
  assert.equal(classifyEastPaloAltoLink("View Details", "Event Link", "", "https://example.test/event/4"), "Meeting Details");
  assert.equal(classifyEastPaloAltoLink("Video", "Event Link", "", "https://youtube.com/watch?v=x"), "Video");
  assert.equal(classifyEastPaloAltoLink("Notice", "Agenda", "Meeting Cancelled", "https://example.test/c.pdf"), "Notice of Cancellation");
  assert.equal(classifyEastPaloAltoLink("", "Agendas", "", "https://example.test/a.pdf"), "Agenda");
  assert.equal(classifyEastPaloAltoLink("", "Minutes", "", "https://example.test/m.pdf"), "Minutes");
});

test("does not collapse dated meetings that share one committee landing page", () => {
  const jurisdiction = getJurisdictionBySlug("east-palo-alto");
  assert.ok(jurisdiction);
  const shared = "https://www.cityofepa.org/city-council";
  const meetings = normalizeEastPaloAltoRows([
    {
      bodyName: "City Council",
      dateTimeText: "Jul 7, 2026 - 06:00 PM",
      rowText: "City Council Jul 7, 2026",
      links: [{ label: "View Details", column: "View", url: shared }]
    },
    {
      bodyName: "City Council",
      dateTimeText: "Jul 21, 2026 - 06:00 PM",
      rowText: "City Council Jul 21, 2026",
      links: [{ label: "View Details", column: "View", url: shared }]
    }
  ], jurisdiction);

  assert.equal(meetings.length, 2);
  assert.notEqual(meetings[0].externalId, meetings[1].externalId);
});

test("resolves East Palo Alto protocol-relative Agenda links against Granicus", () => {
  assert.equal(
    new URL("//cityofepa.granicus.com/AgendaViewer.php?event_id=388", "https://cityofepa.granicus.com/ViewPublisher.php?view_id=1").toString(),
    "https://cityofepa.granicus.com/AgendaViewer.php?event_id=388"
  );
});

test("normalizes distinct East Palo Alto meeting bodies and preserves official resources", () => {
  const jurisdiction = getJurisdictionBySlug("east-palo-alto");
  assert.ok(jurisdiction);
  const meetings = normalizeEastPaloAltoRows([
    {
      bodyName: "Planning Commission",
      dateTimeText: "Jul 13, 2026 - 07:00 PM",
      rowText: "Planning Commission Jul 13, 2026 - 07:00 PM Agenda Agenda Packet",
      links: [
        { label: "Agenda", column: "Agenda", url: "https://www.cityofepa.org/a.pdf" },
        { label: "Agenda Packet", column: "Agenda Packet", url: "https://www.cityofepa.org/p.pdf" }
      ]
    },
    {
      bodyName: "City Council",
      dateTimeText: "Jul 13, 2026 - 06:00 PM",
      rowText: "City Council Jul 13, 2026 - 06:00 PM View Details",
      links: [{ label: "View Details", column: "Event Link", url: "https://www.cityofepa.org/event/2" }]
    }
  ], jurisdiction);
  assert.equal(meetings.length, 2);
  assert.equal(meetings[0].jurisdictionSlug, "east-palo-alto");
  assert.equal(meetings[0].bodyName, "Planning Commission");
  assert.equal(meetings[0].timeText, "07:00 PM");
  assert.deepEqual(meetings[0].documents.map((doc) => doc.type), ["Agenda", "Agenda Packet"]);
  assert.equal(meetings[1].meetingDetailsUrl, "https://www.cityofepa.org/event/2");
  assert.notEqual(meetings[0].externalId, meetings[1].externalId);
});

test("does not attach one dated committee packet to every historical meeting row", () => {
  const jurisdiction = getJurisdictionBySlug("east-palo-alto");
  assert.ok(jurisdiction);
  const reusedPacket =
    "https://www.cityofepa.org/packets/24343/7.1.26_senior_advisory_committee_agenda_packet.pdf";
  const meetings = normalizeEastPaloAltoRows([
    {
      bodyName: "Senior Advisory Committee",
      dateTimeText: "Jul 1, 2026 - 06:00 PM",
      rowText: "Senior Advisory Committee Jul 1, 2026 Agenda Packet",
      links: [{ label: "Agenda Packet", column: "Agenda Packet", url: reusedPacket }]
    },
    {
      bodyName: "Senior Advisory Committee",
      dateTimeText: "Sep 2, 2026 - 06:00 PM",
      rowText: "Senior Advisory Committee Sep 2, 2026 Agenda Packet",
      links: [{ label: "Agenda Packet", column: "Agenda Packet", url: reusedPacket }]
    }
  ], jurisdiction);

  assert.equal(meetings[0].documents.length, 1);
  assert.equal(meetings[1].documents.length, 0);
  assert.ok(meetings[1].extractionNotes?.some((note) => note.includes("different meeting date")));
});

test("attaches council minutes from a later meeting's agenda packet to the meeting they record", () => {
  const jurisdiction = getJurisdictionBySlug("east-palo-alto");
  assert.ok(jurisdiction);
  const row = (dateTimeText: string, links: Array<{ label: string; column: string; url: string }> = []) => ({
    bodyName: "City Council",
    dateTimeText,
    rowText: `City Council ${dateTimeText}`,
    links
  });
  const meetings = normalizeEastPaloAltoRows([
    row("Aug 10, 2026 - 12:00 PM", [{ label: "Agenda", column: "Agenda", url: "https://example.test/aug10-agenda.pdf" }]),
    row("Sep 1, 2026 - 06:00 PM", [{ label: "Agenda", column: "Agenda", url: "https://example.test/sep1-agenda.pdf" }]),
    // The same meeting again from the /meetings page, without agenda documents.
    row("09/01/2026 6:00pm"),
    row("Sep 15, 2026 - 06:00 PM", [{ label: "Agenda Packet", column: "Agenda Packet", url: "https://example.test/sep15-packet.pdf" }]),
    row("Oct 6, 2026 - 06:00 PM", [{ label: "Agenda Packet", column: "Agenda Packet", url: "https://example.test/oct6-packet.pdf" }])
  ], jurisdiction);
  for (const meeting of meetings) meeting.status = meeting.dateText?.startsWith("Oct") ? "Upcoming" : "Past";
  const [aug10, sep1, sep1Copy, sep15, oct6] = meetings;
  sep15.documents[0].extractedText = [
    "SUBJECT: City Council Meeting Minutes",
    "Adopt the August 10, 2026, and September 1, 2026 City Council Meeting Minutes.",
    "EAST PALO ALTO CITY COUNCIL",
    "SPECIAL MEETING MINUTES",
    "Monday, August 10, 2026, 12:00 PM",
    "Motion: Councilmember Romero moved; Councilmember Barragan seconded to approve the Consent Calendar as presented. Motion carried unanimously.",
    "Mayor Lincoln adjourned the meeting at 12:02 PM",
    "111",
    "EAST PALO ALTO CITY COUNCIL",
    "REGULAR MEETING MINUTES",
    "Tuesday, September 1, 2026, 6:00 PM",
    "Motion: Mayor Lincoln moved, Councilmember Dinan seconded, to approve the agenda as proposed. Motion carried unanimously (5-0).",
    "15. ADJOURNMENT",
    "Mayor Lincoln adjourned the meeting at 9:13 PM",
    "115",
    "CONSENT ITEM 3.6",
    "EAST PALO ALTO",
    "CITY COUNCIL",
    "STAFF REPORT"
  ].join("\n");
  oct6.documents[0].extractedText =
    "EAST PALO ALTO CITY COUNCIL\nREGULAR MEETING MINUTES\nTuesday, September 15, 2026, 6:00 PM\nMotion carried unanimously.";

  assert.equal(attachCouncilMinutesFromAgendaPackets(meetings), 2);

  const august = aug10.documents.find((document) => document.type === "Minutes");
  assert.equal(august?.label, "Minutes of August 10, 2026 (in the Sep 15, 2026 agenda packet)");
  assert.match(august?.extractedText || "", /adjourned the meeting at 12:02 PM$/);

  const september = sep1.documents.find((document) => document.type === "Minutes");
  assert.ok(september?.url.startsWith("https://example.test/sep15-packet.pdf#minutes-2026-09-01"));
  assert.match(september?.extractedText || "", /^EAST PALO ALTO CITY COUNCIL\nREGULAR MEETING MINUTES/);
  assert.match(september?.extractedText || "", /adjourned the meeting at 9:13 PM$/);
  assert.doesNotMatch(september?.extractedText || "", /STAFF REPORT/);

  // One meeting per minutes section, and never from a packet whose meeting has
  // not happened yet (its minutes are still unadopted drafts).
  assert.ok(!sep1Copy.documents.some((document) => document.type === "Minutes"));
  assert.ok(!sep15.documents.some((document) => document.type === "Minutes"));
});
