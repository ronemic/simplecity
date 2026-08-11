import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMeetingWideParticipationContext,
  extractAgendaItemsFromText,
  formatAgendaItemContexts,
  mergeAgendaItems
} from "../lib/scraper/agendaItemContext";
import type { AgendaItem, PrimeGovMeeting } from "../lib/types";

const meeting: PrimeGovMeeting = {
  externalId: "epa-pwtc-2026-07-15",
  section: "Upcoming Meetings",
  title: "Public Works and Transportation Commission",
  dateText: "Jul 15, 2026",
  meetingType: "Public Works and Transportation Commission",
  rowText: "",
  sourceUrl: "https://city.example/agenda",
  hasHtmlAgenda: false,
  hasPdf: true,
  documents: []
};

const agendaText = `
APPROVAL OF THE MINUTES
3.1 Commission Minutes
Recommendation: Approve the minutes as presented.
4. PUBLIC COMMENT
5. SPECIAL PRESENTATIONS
5.1 Canopy Informational Presentation
Recommendation: Receive a general informational presentation from Canopy.
5.2 Recology Informational Presentation
Recommendation: Receive a general informational presentation from Recology.
6. STAFF REPORTS
6.1 Draft Work Plan Framework
Recommendation: Receive an informational report. Provide comments and direction and consider adoption of the Work Plan.
EAST PALO ALTO PUBLIC WORKS AND TRANSPORTATION COMMISSION STAFF REPORT
SUBJECT: Canopy Informational Presentation
Recommendation: Receive a general informational presentation from Canopy.
Background: Canopy will explain its tree and environmental services.
`;

function mergeItem(
  agendaNumber: string,
  externalId: string,
  rowText: string,
  attachmentUrls: string[]
): AgendaItem {
  return {
    externalId,
    fileNumber: null,
    agendaNumber,
    itemType: "Business",
    title: "Library renovation contract",
    action: null,
    result: null,
    sourceUrl: "https://city.example/agenda",
    rowText,
    attachments: attachmentUrls.map((url) => ({
      type: "Staff Report",
      label: "Staff Report",
      url
    }))
  };
}

test("merges equivalent agenda-number punctuation and deduplicates attachment URLs", () => {
  const merged = mergeAgendaItems(
    [
      mergeItem(
        "7.A.",
        "existing-7a",
        "Short row",
        ["https://city.example/report.pdf"]
      )
    ],
    [
      mergeItem(
        "7.A",
        "extracted-7a",
        "Longer official agenda row with the recommended action",
        [
          "https://CITY.example/report.pdf",
          "https://city.example/exhibit.pdf"
        ]
      )
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].agendaNumber, "7.A.");
  assert.match(merged[0].rowText, /Longer official agenda row/);
  assert.deepEqual(
    merged[0].attachments?.map((document) => document.url),
    ["https://city.example/report.pdf", "https://city.example/exhibit.pdf"]
  );
});

test("extracts shared participation instructions without leaking agenda items", () => {
  const context = extractMeetingWideParticipationContext(`
Current meeting agenda items (use each block only for its named item):
Official title: Contract approval

Current agenda and meeting-wide participation context:
REGULAR MEETING AGENDA
Join online with meeting ID 846 9472 6242.
Email comments to planning.commission@menlopark.gov.
1. CALL TO ORDER
2. Contract approval for $250
  `);

  assert.match(context, /846 9472 6242/);
  assert.match(context, /planning\.commission@menlopark\.gov/);
  assert.doesNotMatch(context, /Contract approval for \$250/);
});

test("does not treat an opening item at offset zero as shared participation context", () => {
  const context = extractMeetingWideParticipationContext(`
Current agenda and meeting-wide participation context:
1. CALL TO ORDER
2. Contract approval for $250
  `);

  assert.equal(context, "");
});

test("stops shared participation context before structured item blocks", () => {
  const context = extractMeetingWideParticipationContext(`
Current agenda and meeting-wide participation context:
Join online with meeting ID 846 9472 6242.
Current meeting agenda items (use each block only for its named item):
Official title: Contract approval for $250
  `);

  assert.match(context, /846 9472 6242/);
  assert.doesNotMatch(context, /Contract approval for \$250/);
});

test("does not expose unbounded agenda text as meeting-wide participation", () => {
  const context = extractMeetingWideParticipationContext(`
Current agenda and meeting-wide participation context:
Contract approval for $250 with no opening section marker.
  `);

  assert.equal(context, "");
});

test("extracts current numbered agenda items and their recommendations", () => {
  const items = extractAgendaItemsFromText(meeting, agendaText);
  assert.deepEqual(items.map((item) => item.agendaNumber), ["3.1", "5.1", "5.2", "6.1"]);
  assert.equal(items[0].itemType, "APPROVAL OF THE MINUTES");
  assert.match(items[0].rowText, /Agenda section: APPROVAL OF THE MINUTES/);
  assert.equal(items[1].title, "Canopy Informational Presentation");
  assert.match(items[1].action || "", /Receive a general informational presentation/);
  assert.match(items[1].rowText, /Linked staff report context/);
  assert.match(items[1].rowText, /tree and environmental services/);
  const context = formatAgendaItemContexts(items);
  assert.match(context, /Agenda item 5\.1/);
  assert.match(context, /Agenda section: APPROVAL OF THE MINUTES/);
  assert.match(context, /Recommended action: Receive a general informational presentation/);
});

test("supports common whole-number and Item-prefixed agenda formats", () => {
  const items = extractAgendaItemsFromText(
    meeting,
    "1. CALL TO ORDER 2. PUBLIC COMMENT Item 3: Library contract Recommendation: Award the library contract. 4 Transportation update Recommendation: Receive the update."
  );
  assert.deepEqual(items.map((item) => item.agendaNumber), ["3", "4"]);
  assert.match(items[0].action || "", /Award the library contract/);
  assert.match(items[1].action || "", /Receive the update/);
});

test("extracts PrimeGov whole-number items rendered on lines after an unnumbered opening", () => {
  const items = extractAgendaItemsFromText(
    meeting,
    `
CITY COUNCIL REGULAR MEETING AGENDA
CALL TO ORDER

Pledge of Allegiance

CEREMONIAL

1.

Pride Month – Proclamation

DOWNLOAD
2.

Community Access Update – Presentation

DOWNLOAD
CONSENT CALENDAR

3.

Library Renovation Contract

Approve the agreement for library renovation services.

DOWNLOAD
4.

445 South B Street Mixed-Use Development

Adopt the development agreement ordinance.

DOWNLOAD
5.

2026 Transportation Program Annual Review

Receive the annual progress update.

DOWNLOAD
ADJOURNMENT
`
  );

  assert.deepEqual(items.map((item) => item.agendaNumber), ["1", "2", "3", "4", "5"]);
  assert.equal(items[0].title, "Pride Month – Proclamation");
  assert.equal(items[2].title, "Library Renovation Contract");
  assert.match(items[2].rowText, /Approve the agreement/);
  assert.equal(items[3].title, "445 South B Street Mixed-Use Development");
  assert.equal(items[4].title, "2026 Transportation Program Annual Review");
});

test("uses lettered call-to-order and adjournment sections as current-agenda boundaries", () => {
  const items = extractAgendaItemsFromText(
    meeting,
    `
Prior packet cover material
A. CALL TO ORDER
F. PUBLIC HEARINGS
F1. Current contract
Recommendation: Approve the current contract.
H. ADJOURNMENT
1. Call To Order from attached historical minutes
2. Historical contract
Recommendation: Approve the historical contract.
`
  );

  assert.deepEqual(items.map((item) => item.agendaNumber), ["F1"]);
  assert.match(items[0].title ?? "", /Current contract/);
  assert.doesNotMatch(items[0].rowText, /Historical contract/);
});

test("does not split legal chapter numbers out of numbered agenda-item titles", () => {
  const items = extractAgendaItemsFromText(
    meeting,
    "1. CALL TO ORDER 2. CONSENT CALENDAR 2.1 Amend Chapter 11.87 of the City Code to update permits Recommendation: Adopt the ordinance. 2.2 Amend Chapter 17.78 governing accessory dwelling units Recommendation: Adopt the ordinance. 3. ADJOURNMENT"
  );

  assert.deepEqual(items.map((item) => item.agendaNumber), ["2.1", "2.2"]);
  assert.match(items[0].title ?? "", /Chapter 11\.87/);
  assert.match(items[1].title ?? "", /Chapter 17\.78/);
});

test("keeps numbered items whose official title starts with a lettered action", () => {
  const items = extractAgendaItemsFromText(
    meeting,
    "1. CALL TO ORDER 2. CONSENT CALENDAR 2.1 First contract Recommendation: Approve. 2.2. a) A Resolution approving the second contract b) Adopt Resolution 3. ADJOURNMENT"
  );

  assert.deepEqual(items.map((item) => item.agendaNumber), ["2.1", "2.2"]);
  assert.match(items[1].title ?? "", /^a\) A Resolution approving/);
});

test("extracts unnumbered agenda items without treating legal references as item numbers", () => {
  const items = extractAgendaItemsFromText(
    meeting,
    `
CALL TO ORDER AND ROLL CALL
DISCUSSION AND ACTION
EPASD AC Ad Hoc Committee Draft Workplan
Recommendation:
1. Receive an informational report concerning an EPASD Draft Workplan Framework.
1. Provide comments and direction and consider adoption of the workplan.
1. Select a topic within the framework to study and discuss.
Public Hearing and Approval of Previously Adopted Sewer Service Charges to
be Collected on the San Mateo County Tax Roll for FY 2026–27
Recommendation:
1. Give an informational report concerning sewer service charges pursuant to Health and Safety Code §5473–5473.4; and
1. The item will go to the EPASD Board later for approval.
FUTURE AGENDA ITEM REQUEST
Future EPASD AC Item Requests
Recommendation: Provide requests for future agenda items.
ADJOURNMENT
The packet is available 72 hours before the meeting.
COMMITTEE REPORTS 3.1
EAST PALO ALTO SANITARY DISTRICT STAFF REPORT
SUBJECT: Historical contract award
Recommendation: Approve a historical contract.
`
  );

  assert.deepEqual(
    items.map((item) => item.title),
    [
      "EPASD AC Ad Hoc Committee Draft Workplan",
      "Public Hearing and Approval of Previously Adopted Sewer Service Charges to be Collected on the San Mateo County Tax Roll for FY 2026–27"
    ]
  );
  assert.ok(items.every((item) => item.agendaNumber === null));
  assert.doesNotMatch(items.map((item) => item.rowText).join(" "), /historical contract/i);
});
