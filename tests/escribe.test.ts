import assert from "node:assert/strict";
import test from "node:test";
import { getJurisdictionBySlug } from "@/lib/config/jurisdictions";
import {
  classifyEscribeDocument,
  normalizeEscribeMeetingRecords,
  shouldDownloadEscribeDocument,
  type EscribeMeetingRecord
} from "@/lib/sources/escribe";

test("classifies eSCRIBE meeting packages and supplemental documents", () => {
  assert.equal(
    classifyEscribeDocument({ Title: "Agenda Full Package (HTML)", Type: "Agenda", Format: "HTML" }),
    "HTML Agenda"
  );
  assert.equal(
    classifyEscribeDocument({ Title: "Agenda Full Package (PDF)", Type: "Agenda", Format: ".pdf" }),
    "Agenda Packet"
  );
  assert.equal(
    classifyEscribeDocument({ Title: "Agenda (PDF)", Type: "AgendaCover", Format: ".pdf" }),
    "Agenda"
  );
  assert.equal(
    classifyEscribeDocument({ Title: "Public Comments", Type: "AdditionalDocuments", Format: ".pdf" }),
    "Public Comments"
  );
  assert.equal(
    classifyEscribeDocument({ Title: "TRC Meeting Cancellation.pdf", Type: "AdditionalDocuments", Format: ".pdf" }),
    "Notice of Cancellation"
  );
});

test("normalizes stable eSCRIBE IDs, official links, and cancellation status", () => {
  const jurisdiction = getJurisdictionBySlug("foster-city");
  assert.ok(jurisdiction);
  const records: EscribeMeetingRecord[] = [{
    Id: "57a5243e-a00a-40db-a118-521d38d0e673",
    MeetingType: "City Council Regular Meeting ",
    DateLong: "August 17, 2026",
    MeetingTime: "6:30 PM",
    LocationName: "FOSTER CITY COUNCIL CHAMBERS",
    Cancelled: false,
    MeetingLinks: [
      {
        Title: "Agenda Full Package (HTML)",
        Type: "Agenda",
        Format: "HTML",
        Url: "/Meeting.aspx?Id=57a5243e-a00a-40db-a118-521d38d0e673&Agenda=Agenda&lang=English"
      },
      {
        Title: "Agenda Full Package (PDF)",
        Type: "Agenda",
        Format: ".pdf",
        Url: "/FileStream.ashx?DocumentId=245"
      }
    ],
    section: "Past Meetings"
  }, {
    Id: "9eab6424-471b-44ee-b616-713463caa520",
    MeetingType: "Traffic Review Committee Regular Meeting",
    FormattedStart: "Thursday, August 27, 2026 @ 1:00 PM",
    Cancelled: true,
    MeetingLinks: [{
      Title: "TRC Meeting Cancellation.pdf",
      Type: "AdditionalDocuments",
      Format: ".pdf",
      Url: "/FileStream.ashx?DocumentId=350"
    }],
    section: "Upcoming Meetings"
  }];

  const meetings = normalizeEscribeMeetingRecords(records, jurisdiction);
  assert.equal(meetings.length, 2);
  const council = meetings.find((meeting) => meeting.meetingType === "City Council Regular Meeting");
  const cancelled = meetings.find((meeting) => meeting.status === "Cancelled");
  assert.equal(
    council?.externalId,
    "foster-city:escribe-meeting:57a5243e-a00a-40db-a118-521d38d0e673"
  );
  assert.equal(council?.platform, "escribe");
  assert.equal(council?.documents[0].type, "HTML Agenda");
  assert.equal(council?.documents[1].type, "Agenda Packet");
  assert.equal(cancelled?.documents[0].type, "Notice of Cancellation");
  assert.match(cancelled?.sourceUrl || "", /Meeting\.aspx\?Id=9eab6424/);
});

test("deduplicates an upcoming meeting over the same past API record", () => {
  const jurisdiction = getJurisdictionBySlug("foster-city");
  assert.ok(jurisdiction);
  const base = {
    Id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    MeetingType: "Planning Commission Regular Meeting",
    FormattedStart: "Thursday, August 20, 2026 @ 7:00 PM",
    MeetingLinks: []
  };

  const meetings = normalizeEscribeMeetingRecords([
    { ...base, section: "Past Meetings" },
    { ...base, section: "Upcoming Meetings" }
  ], jurisdiction);
  assert.equal(meetings.length, 1);
  assert.equal(meetings[0].section, "Upcoming Meetings");
  assert.equal(meetings[0].status, "Upcoming");
});

test("keeps submitted comments linked without downloading their bodies", () => {
  const portalUrl = "https://pub-fostercity.escribemeetings.com/";
  assert.equal(
    shouldDownloadEscribeDocument({
      type: "Public Comments",
      url: `${portalUrl}FileStream.ashx?DocumentId=338`
    }, portalUrl),
    false
  );
  assert.equal(
    shouldDownloadEscribeDocument({
      type: "Agenda",
      url: `${portalUrl}FileStream.ashx?DocumentId=244`
    }, portalUrl),
    true
  );
});
