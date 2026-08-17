import assert from "node:assert/strict";
import test from "node:test";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import {
  attachLasdArchiveDocuments,
  neededLasdArchiveLinks,
  normalizeLasdArchiveRows,
  normalizeSimbliRows,
  simbliMeetingId,
  simbliMinutesUrl,
  shouldDownloadSimbliDocument,
  type SimbliListingRow
} from "@/lib/sources/simbli";

const jurisdiction = {
  slug: "los-altos-school-district",
  name: "Los Altos School District",
  platform: "simbli",
  sourceUrl: "https://simbli.eboardsolutions.com/SB_Meetings/SB_MeetingListing.aspx?S=36030305"
} as JurisdictionConfig;

function row(overrides: Partial<SimbliListingRow> = {}): SimbliListingRow {
  return {
    dateTimeText: "08/03/2026 - 07:00 PM",
    title: "Regular Meeting of the Board of Trustees",
    meetingType: "Board Meeting",
    titleAction: 'return ViewMeeting("36030305","76138","1","0","P",event);',
    minutesAction: null,
    minutesUrl: null,
    rowText: "08/03/2026 Regular Meeting of the Board of Trustees Board Meeting",
    ...overrides
  };
}

test("extracts stable Simbli meeting IDs", () => {
  assert.equal(simbliMeetingId('ViewMeeting("36030305","76138","1")'), "76138");
  assert.equal(simbliMeetingId("https://example.test/ViewMeeting.aspx?S=1&MID=76543"), "76543");
});

test("constructs the public Simbli minutes view from a published minutes action", () => {
  assert.equal(
    simbliMinutesUrl('ViewMinutes("36030305","76138",event)', jurisdiction.sourceUrl),
    "https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=36030305&MID=76138&T=1"
  );
});

test("keeps only board meetings including special and closed-session meetings", () => {
  const meetings = normalizeSimbliRows([
    row(),
    row({ title: "Special Meeting of the Board of Trustees", titleAction: 'ViewMeeting("36030305","76139")' }),
    row({ title: "Special Closed Session Meeting of the Board of Trustees", titleAction: 'ViewMeeting("36030305","76140")' }),
    row({ title: "Closed Session", titleAction: 'ViewMeeting("36030305","76141")' }),
    row({ title: "Citizens Advisory Committee for Finance", meetingType: "Committee Meeting", titleAction: 'ViewMeeting("36030305","76142")' })
  ], jurisdiction, jurisdiction.sourceUrl, Date.UTC(2026, 7, 1));

  assert.equal(meetings.length, 4);
  assert.deepEqual(meetings.map((meeting) => meeting.externalId), [
    "los-altos-school-district-simbli-meeting-76138",
    "los-altos-school-district-simbli-meeting-76139",
    "los-altos-school-district-simbli-meeting-76140",
    "los-altos-school-district-simbli-meeting-76141"
  ]);
  assert.ok(meetings.every((meeting) => meeting.bodyName === "Board of Trustees"));
});

test("marks board cancellation records as cancelled", () => {
  const [meeting] = normalizeSimbliRows([
    row({ title: "Board Meeting Cancellation", rowText: "Board Meeting Cancellation Board Meeting" })
  ], jurisdiction);
  assert.equal(meeting.status, "Cancelled");
});

test("attaches direct agenda, supporting documents, minutes, and video from LASD mirror", () => {
  const meetings = normalizeSimbliRows([row()], jurisdiction);
  const attached = attachLasdArchiveDocuments(meetings, [{
    dateText: "August 3, 2026",
    links: [
      { label: "Agenda", url: "https://files.smartsites.parentsquare.com/9655/agenda.pdf" },
      { label: "Supporting Documentation", url: "https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=36030305&MID=76138" },
      { label: "Minutes", url: "https://files.smartsites.parentsquare.com/9655/minutes.pdf" },
      { label: "Video", url: "https://youtu.be/example" }
    ]
  }]);

  assert.equal(attached, 3); // The Simbli details URL is already present.
  assert.deepEqual(meetings[0].documents.map((document) => document.type), [
    "Meeting Details", "Agenda", "Minutes", "Video"
  ]);
  assert.equal(meetings[0].hasPdf, true);
});

test("matches same-day regular and special archives without crossing their documents", () => {
  const meetings = normalizeSimbliRows([
    row({ dateTimeText: "06/01/2026 - 07:00 PM", titleAction: 'ViewMeeting("36030305","67465")' }),
    row({
      dateTimeText: "06/01/2026 - 09:00 AM",
      title: "Special Meeting of the Board of Trustees",
      titleAction: 'ViewMeeting("36030305","67466")'
    })
  ], jurisdiction);
  attachLasdArchiveDocuments(meetings, [
    {
      dateText: "June 1, 2026",
      links: [
        { label: "Agenda", url: "https://files.smartsites.parentsquare.com/9655/regular-agenda.pdf" },
        { label: "Minutes", url: "https://files.smartsites.parentsquare.com/9655/regular-minutes.pdf" }
      ]
    },
    {
      dateText: "June 1, 2026",
      links: [
        { label: "Special Meeting Agenda", url: "https://files.smartsites.parentsquare.com/9655/special-agenda.pdf" },
        { label: "Minutes", url: "https://files.smartsites.parentsquare.com/9655/special-minutes.pdf" }
      ]
    }
  ]);

  assert.ok(meetings[0].documents.some((document) => document.url.endsWith("regular-minutes.pdf")));
  assert.ok(!meetings[0].documents.some((document) => document.url.endsWith("special-minutes.pdf")));
  assert.ok(meetings[1].documents.some((document) => document.url.endsWith("special-minutes.pdf")));
});

test("does not treat the blocked Simbli viewer as parsed minutes and uses direct archive minutes", () => {
  const meetings = normalizeSimbliRows([
    row({ minutesAction: 'ViewMinutes("36030305","76138",event)' })
  ], jurisdiction);
  assert.equal(meetings[0].documents.filter((document) => document.type === "Minutes").length, 0);
  assert.ok(meetings[0].documents.some((document) =>
    document.type === "Document" && document.label === "Official minutes page"
  ));

  attachLasdArchiveDocuments(meetings, [{
    dateText: "August 3, 2026",
    links: [{ label: "Minutes", url: "https://files.smartsites.parentsquare.com/9655/direct-minutes.pdf" }]
  }]);

  const minutes = meetings[0].documents.filter((document) => document.type === "Minutes");
  assert.deepEqual(minutes.map((document) => document.url), [
    "https://files.smartsites.parentsquare.com/9655/direct-minutes.pdf"
  ]);
});

test("never downloads a Simbli HTML block response as an official document", () => {
  assert.equal(shouldDownloadSimbliDocument({
    type: "Minutes",
    label: "Minutes",
    url: "https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=36030305&MID=70284&T=1"
  }), false);
  assert.equal(shouldDownloadSimbliDocument({
    type: "Agenda Packet",
    label: "Supporting Documentation",
    url: "https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=36030305&MID=70284"
  }), false);
  assert.equal(shouldDownloadSimbliDocument({
    type: "Minutes",
    label: "Minutes",
    url: "https://files.smartsites.parentsquare.com/9655/approved-minutes.pdf"
  }), true);
});

test("selects only archive pages needed by scraped meeting school years", () => {
  const meetings = normalizeSimbliRows([
    row({ dateTimeText: "06/08/2026 - 07:00 PM" })
  ], jurisdiction);
  assert.deepEqual(neededLasdArchiveLinks(meetings, [
    { schoolYear: "2025-26", url: "https://www.lasdschools.org/261797_3" },
    { schoolYear: "2024-25", url: "https://www.lasdschools.org/182036_3" }
  ]), [{ schoolYear: "2025-26", url: "https://www.lasdschools.org/261797_3" }]);
});

test("official archive can discover meetings when the Simbli listing is unavailable", () => {
  const meetings = normalizeLasdArchiveRows([
    {
      dateText: "June 8, 2026",
      links: [
        { label: "Revised Agenda", url: "https://files.smartsites.parentsquare.com/9655/revised-agenda.pdf" },
        { label: "Supporting Documentation", url: "https://simbli.eboardsolutions.com/SB_Meetings/ViewMeeting.aspx?S=36030305&MID=70284" },
        { label: "Minutes", url: "https://files.smartsites.parentsquare.com/9655/approved-minutes.pdf" }
      ]
    },
    {
      dateText: "June 1, 2026",
      links: [
        { label: "Special Meeting Agenda", url: "https://files.smartsites.parentsquare.com/9655/special-agenda.pdf" },
        { label: "Minutes", url: "https://files.smartsites.parentsquare.com/9655/special-minutes.pdf" }
      ]
    }
  ], jurisdiction, jurisdiction.sourceUrl, Date.UTC(2026, 7, 12));

  assert.equal(meetings.length, 2);
  assert.equal(meetings[0].externalId, "los-altos-school-district-simbli-meeting-70284");
  assert.equal(meetings[0].title, "Regular Meeting of the Board of Trustees - Revised");
  assert.equal(meetings[1].externalId, "los-altos-school-district-simbli-meeting-2026-06-01-special");
  assert.ok(meetings.every((meeting) => meeting.documents.some((document) => document.type === "Minutes")));
});
