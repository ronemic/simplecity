import assert from "node:assert/strict";
import test from "node:test";
import { getJurisdictionBySlug } from "@/lib/config/jurisdictions";
import {
  attachLaserficheMinutes,
  normalizeAgendaOnlineItemLink,
  normalizeAgendaOnlineRows
} from "@/lib/sources/agenda-online";

test("normalizes Redwood City Agenda Online rows and document types", () => {
  const jurisdiction = getJurisdictionBySlug("redwood-city");
  assert.ok(jurisdiction);

  const meetings = normalizeAgendaOnlineRows([
    {
      meetingId: "2716",
      title: "July 13, 2026 Regular City Council Meeting",
      bodyName: "City Council",
      dateText: "7/13/2026 6:00:00 PM",
      rowText: "July 13, 2026 Regular City Council Meeting City Council",
      detailsUrl: "https://meetings.redwoodcity.org/AgendaOnline/Meetings/ViewMeeting?id=2716&doctype=1",
      documents: [
        {
          label: "Download",
          url: "https://meetings.redwoodcity.org/AgendaOnline/Documents/Downloadfile/agenda.pdf?documentType=1&meetingId=2716"
        },
        {
          label: "Download",
          url: "https://meetings.redwoodcity.org/AgendaOnline/Documents/Downloadfile/packet.pdf?documentType=5&meetingId=2716&isAttachment=True"
        }
      ]
    }
  ], jurisdiction, new Date("2026-07-12T12:00:00-07:00").getTime());

  assert.equal(meetings.length, 1);
  assert.equal(meetings[0].externalId, "redwood-city-agenda-online-2716");
  assert.equal(meetings[0].status, "Upcoming");
  assert.deepEqual(meetings[0].documents.map((document) => document.type), ["Agenda", "Agenda Packet"]);
});

test("attaches Redwood City Laserfiche minutes to the unique same-day City Council meeting", () => {
  const jurisdiction = getJurisdictionBySlug("redwood-city");
  assert.ok(jurisdiction);
  const meetings = normalizeAgendaOnlineRows([
    {
      meetingId: "2677",
      title: "June 8, 2026 Regular City Council Meeting",
      bodyName: "City Council",
      dateText: "6/8/2026 6:00:00 PM",
      rowText: "June 8, 2026 Regular City Council Meeting",
      detailsUrl: "https://meetings.redwoodcity.org/AgendaOnline/Meetings/ViewMeeting?id=2677",
      documents: []
    }
  ], jurisdiction, Date.parse("2026-07-01"));

  assert.equal(attachLaserficheMinutes(meetings, [{
    label: "2026.06.08 Approved Minutes",
    url: "https://documents.redwoodcity.org/PublicWeblink/0/doc/528589/Page1.aspx"
  }]), 1);
  assert.equal(meetings[0].documents[0].type, "Minutes");
  assert.match(meetings[0].documents[0].url, /528589/);
});

test("normalizes Agenda Online item identifiers without losing dotted item numbers", () => {
  assert.deepEqual(
    normalizeAgendaOnlineItemLink("14763", "7.A. Authorization of annual membership dues"),
    {
      itemId: "14763",
      agendaNumber: "7.A",
      title: "Authorization of annual membership dues"
    }
  );
});
