import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMeetingWideParticipationContext,
  extractAgendaItemsFromText,
  formatAgendaItemContexts
} from "../lib/scraper/agendaItemContext";
import type { PrimeGovMeeting } from "../lib/types";

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

test("does not split legal chapter numbers out of numbered agenda-item titles", () => {
  const items = extractAgendaItemsFromText(
    meeting,
    "1. CALL TO ORDER 2. CONSENT CALENDAR 2.1 Amend Chapter 11.87 of the City Code to update permits Recommendation: Adopt the ordinance. 2.2 Amend Chapter 17.78 governing accessory dwelling units Recommendation: Adopt the ordinance. 3. ADJOURNMENT"
  );

  assert.deepEqual(items.map((item) => item.agendaNumber), ["2.1", "2.2"]);
  assert.match(items[0].title, /Chapter 11\.87/);
  assert.match(items[1].title, /Chapter 17\.78/);
});

test("keeps numbered items whose official title starts with a lettered action", () => {
  const items = extractAgendaItemsFromText(
    meeting,
    "1. CALL TO ORDER 2. CONSENT CALENDAR 2.1 First contract Recommendation: Approve. 2.2. a) A Resolution approving the second contract b) Adopt Resolution 3. ADJOURNMENT"
  );

  assert.deepEqual(items.map((item) => item.agendaNumber), ["2.1", "2.2"]);
  assert.match(items[1].title, /^a\) A Resolution approving/);
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
