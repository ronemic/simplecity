import assert from "node:assert/strict";
import test from "node:test";
import { extractDecisionOutcome } from "../lib/outcomes/extractDecisionOutcome";
import { parseMinutesOutline } from "../lib/outcomes/minutesOutline";

type Meeting = Parameters<typeof extractDecisionOutcome>[1];
type Card = Parameters<typeof extractDecisionOutcome>[0];

function meetingWithMinutes(
  slug: string,
  dateText: string,
  items: { agendaNumber: string; title: string; externalId: string }[],
  minutesText: string
) {
  return {
    title: "City Council Regular Meeting",
    bodyName: "City Council",
    jurisdictionSlug: slug,
    dateText,
    status: "Past",
    items: items.map((item) => ({ rowText: `${item.agendaNumber} ${item.title}`, ...item })),
    documents: [{ type: "Minutes", label: "Minutes", url: "https://example.test/minutes.pdf", extractedText: minutesText }]
  } as unknown as Meeting;
}

const card = (sourceItemId: string | null, agendaItem: string) =>
  ({ id: sourceItemId || agendaItem, source_item_id: sourceItemId, agenda_item: agendaItem, source_url: null }) as unknown as Card;

// Santa Maria, Nov 3, 2026 (eScribe): each number stands alone on its line and
// attachments are listed as "1.Report - ...".
const SANTA_MARIA_MINUTES = `CITY COUNCIL MEETING MINUTES CITY OF SANTA MARIA, CALIFORNIA
11.
CONSENT CALENDAR

Consent Calendar Items 11.a.1 through 11.b.2 were approved as presented.
Moved by:Mayor Pro Tem Gloria Flores
Seconded by:Councilmember Richard Batalla
Adopted the Consent Calendar as submitted.
Motion carried by a recorded vote (4 to 0)
11.a
CITY MANAGER/CITY CLERK DEPARTMENT

11.a.2
Approval of Minutes

1.Post-Meeting Minutes - CC_Oct20_2026 - English.pdf
Moved by:Mayor Pro Tem Gloria Flores
Seconded by:Councilmember Richard Batalla

Approved the Minutes of the regular City Council meeting of October 20, 2026.

Motion carried by a recorded vote
11.a.3
Request for Bond Release for Planned Development Permit Number PD2023-0008

1.Report - Bond Release_PD2023-0008_2026-11-03.pdf
2.Attachment A - Department Requests for Release_2026-11-03.pdf
Moved by:Mayor Pro Tem Gloria Flores
Seconded by:Councilmember Richard Batalla

By motion, authorized the release of Performance Bond – Public Improvements in the full amount of $308,578.76.

Motion carried by a recorded vote
11.b
FINANCE DEPARTMENT

11.b.3
Adoption of a Resolution Approving Participation in the PARS Post-Employment Benefits Trust Program

1.Report - Adopt a Resolution Approving Participation in the PARS Post-Employment Benefits Trust Program.pdf
Action:Adopted as Resolution No. 2026-221.
Moved by:Mayor Pro Tem Gloria Flores
Seconded by:Councilmember Richard Batalla
Adopted a Resolution approving the Adoption of the Public Agencies Post-Employment Benefits Trust.
Motion carried by a recorded vote
12.
REPORT BY CITY MANAGER

City Manager Rowlands thanked the residents who participated in the election.
`;

test("reads eScribe minutes whose item numbers stand alone on their lines (Santa Maria)", () => {
  const entries = parseMinutesOutline(SANTA_MARIA_MINUTES);
  assert.deepEqual(entries.map((entry) => entry.number), ["11", "11.a", "11.a.2", "11.a.3", "11.b", "11.b.3", "12"]);
  assert.equal(entries[3].title, "Request for Bond Release for Planned Development Permit Number PD2023-0008");

  const meeting = meetingWithMinutes("santa-maria", "November 03, 2026", [
    { agendaNumber: "11.a.3", title: "Request for Bond Release for Planned Development Permit Number PD2023-0008", externalId: "sm-item-43" },
    { agendaNumber: "11.b.3", title: "Adoption of a Resolution Approving Participation in the PARS Trust", externalId: "sm-item-57" }
  ], SANTA_MARIA_MINUTES);

  const bond = extractDecisionOutcome(card("sm-item-43", "Vote on bond release for PD2023-0008 development"), meeting);
  assert.equal(bond?.matchedAgendaNumber, "11.a.3");
  assert.equal(bond?.canonicalStatus, "approved");
  // The attachment list ("1.Report - ...") stays inside the item.
  assert.match(bond?.sourceText || "", /authorized the release of Performance Bond/);

  const pars = extractDecisionOutcome(card("sm-item-57", "Approve participation in PARS post-employment benefits program"), meeting);
  assert.match(pars?.sourceText || "", /Adopted as Resolution No\. 2026-221/);
});

test("does not read standalone page numbers as an outline", () => {
  assert.deepEqual(parseMinutesOutline("1\nReducewaste.org\nMotion passed.\n2\nReducewaste.org\n3\nReducewaste.org\n"), []);
});

// Solvang, Oct 26, 2026: lettered items under "6. CONSENT ITEMS"; the calendar
// motion follows the list and one item is voted separately.
const SOLVANG_MINUTES = `M 2026-10-26 CC
5. GC SECTION 53232.3(d) (aka AB 1234) and GC SECTION 84308 (aka SB 1439)
REPORT OUT, EX-PARTE COMMUNICATIONS, COUNCIL COMMENTS, REQUESTS
Staff was directed to bring back City Council Goals as a discussion item.

6. CONSENT ITEMS
a. Approve order of Agenda as presented

b. Approve City Council Minutes of Special Closed and Regular Meetings of October 12, 2026

c. SYVT Monthly Ridership Report, Sept. 2026 - Receive and File

d. Receive and File Update #1 to 2026/28 Solvang City Council Goals

g. Approve Contract with Full Moon Audio Co. for Julefest Services for the Amount not to Exceed
$101,682.50 for the Term November 1, 2026 – October 31, 2027.

Motion by Councilmember E Orona, seconded by Councilmember Infanti to approve Consent
excluding Item 6.d for discussion, carried 5/0.

Motion by Mayor Brown, seconded by Councilmember Infanti to approve Item 6.d, carried 5/0.

7. PUBLIC HEARINGS - None

8. DISCUSSION ITEMS

c. Authorize the Purchase of Two Diamond Coach Vehicles for the SYVT Fleet

Report provided by City Manager Murphy

Motion by Councilmember Infanti, seconded by Mayor Brown to Authorize the Purchase of Two
Diamond Coach Vehicles for the SYVT Fleet, carried 4/1 – E Orona opposed.

9. COUNCIL CLOSING COMMENTS
`;

test("reads lettered items under numbered sections and the consent motion (Solvang)", () => {
  const meeting = meetingWithMinutes("solvang", "Oct 26, 2026 06:30 PM", [
    { agendaNumber: "6.c", title: "SYVT Monthly Ridership Report, Sept. 2026 - Receive and File", externalId: "solvang-505-item-6-c" },
    { agendaNumber: "6.d", title: "Receive and File Update #1 to 2026/28 Solvang City Council Goals", externalId: "solvang-505-item-6-d" },
    { agendaNumber: "6.g", title: "Approve Contract with Full Moon Audio Co. for Julefest Services", externalId: "solvang-505-item-6-g" },
    { agendaNumber: "8.c", title: "Authorize the Purchase of Two Diamond Coach Vehicles for the SYVT Fleet", externalId: "solvang-505-item-8-c" }
  ], SOLVANG_MINUTES);

  const ridership = extractDecisionOutcome(card("solvang-505-item-6-c", "Receive September 2026 SYVT Ridership Report"), meeting);
  assert.equal(ridership?.matchedAgendaNumber, "6.c");
  assert.match(ridership?.sourceText || "", /approve Consent excluding Item 6\.d for discussion, carried 5\/0/);

  // Pulled from consent: takes its own vote, not the calendar's.
  const goals = extractDecisionOutcome(card("solvang-505-item-6-d", "Receive and file Update #1 to 2026/28 Council Goals"), meeting);
  assert.match(goals?.sourceText || "", /approve Item 6\.d, carried 5\/0/);

  const coaches = extractDecisionOutcome(card("solvang-505-item-8-c", "Authorize purchase of two Diamond Coach vehicles"), meeting);
  assert.match(coaches?.sourceText || "", /carried 4\/1/);
});

// Los Altos Hills, Aug 20, 2026: the consent motion precedes the lettered list,
// and the agenda letters items without their section ("A").
const LOS_ALTOS_HILLS_MINUTES = `Town of Los Altos Hills
2. PRESENTATIONS AND APPOINTMENTS
F. Los Altos Hills County Fire District Ten-Year Budget Forecast
Council discussed the District's long-term capital and operational planning and thanked the
representatives for the presentation and the District's continued partnership with the Town.
3. PRESENTATIONS FROM THE FLOOR
1. Jill Grunewald
4. INFORMATIONAL REPORTS
5. CONSENT CALENDAR
There was no public comment on the Consent Calendar.
MOTION MADE: Council Member Tyson moved to approve the Consent Calendar.
MOTION SECONDED: Council Member Mok.
AYES: Mayor Bhateja, Vice Mayor Swan, Council Members Mok and Tyson
NOES: None
ABSENT: Council Member Tankha
MOTION CARRIED: 4-0-1.
A. Approval of the City Council Special Meeting Minutes June 18, 2026, 4:30 PM.
J. Resolution Approving the Sewer Construction and Dedication Agreement with the Property Owner
of 25386 La Loma Drive.
6. PUBLIC HEARINGS
A.Resolution Authorizing the City Manager to Execute a Five-Year Law Enforcement
Services Agreement with the Santa Clara County Office of the Sheriff
City Council Meeting Minutes Page 3 Monday, August 31, 2026 Manager Einfalt confirmed that
the agreement terms were final. She stated that the agreement should be executed.
Mayor B
hateja moved to authorize execution of the five-year Law Enforcement Services Agreement.
Council Member Mok seconded the motion.
AYES: Mayor Bhateja, Vice Mayor Swan, Council Members Mok, Tankha, and Tyson
MOTION CARRIED 5-0.
7. ADJOURN
`;

test("reads Los Altos Hills motion records and matches letter-only agenda numbers by title", () => {
  const meeting = meetingWithMinutes("los-altos-hills", "Aug 20, 2026", [
    { agendaNumber: "A", title: "Resolution Authorizing the City Manager to Execute a Five-Year Law Enforcement Services Agreement with the Santa Clara County Office of the Sheriff (Staff: C. Einfalt)", externalId: "lah-item-a" }
  ], LOS_ALTOS_HILLS_MINUTES);

  const sewer = extractDecisionOutcome(card(null, "Approve Sewer Construction and Dedication Agreement for 25386 La Loma Drive"), meeting);
  assert.equal(sewer?.matchedAgendaNumber, "5.J");
  assert.match(sewer?.sourceText || "", /moved to approve the Consent Calendar[\s\S]*MOTION CARRIED: 4-0-1/);

  // The vote, not the page header's "confirmed".
  const sheriff = extractDecisionOutcome(card("lah-item-a", "Authorize five-year law enforcement services agreement"), meeting);
  assert.match(sheriff?.sourceText || "", /^Mayor B hateja moved to authorize[\s\S]*MOTION CARRIED 5-0/);

  // A presentation's "continued partnership" is not a "Continued" result.
  assert.equal(
    extractDecisionOutcome(card(null, "Los Altos Hills County Fire District Ten-Year Budget Forecast"), meeting),
    null
  );
});

test("ignores lettered outlines with a missing section or lettered sections", () => {
  // Guadalupe: "8." through "12." were not read, so later items would fold
  // into the consent calendar.
  assert.deepEqual(
    parseMinutesOutline("6. PRESENTATIONS\nA. Climate Action Plan\n7. CONSENT CALENDAR\nA. Warrants\n13. FUTURE AGENDA ITEMS\n"),
    []
  );
  // Los Altos School District letters its sections and numbers the items.
  assert.deepEqual(
    parseMinutesOutline("A. CALL TO ORDER\nB. PUBLIC COMMENT\nC. ADJOURN TO CLOSED SESSION\n1. ACTION ITEMS\na. BP/AR 5117\n"),
    []
  );
});

test("ignores minutes whose header records another meeting (Los Altos Hills, Oct 15)", () => {
  const sep17Minutes = `Approved October 15, 2026
Town of Los Altos Hills
City Council Regular Meeting Minutes
Thursday, September 17, 2026 at 6:00 P.M.
${LOS_ALTOS_HILLS_MINUTES}`;
  const items = [{ agendaNumber: "A", title: "Resolution Authorizing the City Manager to Execute a Five-Year Law Enforcement Services Agreement", externalId: "lah-item-a" }];
  const sheriff = card("lah-item-a", "Authorize five-year law enforcement services agreement");

  assert.equal(extractDecisionOutcome(sheriff, meetingWithMinutes("los-altos-hills", "Oct 15, 2026", items, sep17Minutes)), null);
  assert.ok(extractDecisionOutcome(sheriff, meetingWithMinutes("los-altos-hills", "Sep 17, 2026", items, sep17Minutes)));
});

test("reads the meeting date from a minutes title line without a weekday (Carpinteria)", () => {
  const oct22Minutes = `City of Carpinteria
Carpinteria Open Space Management Advisory Board Regular Meeting Minutes October 22, 2026, at 3:00 PM
${LOS_ALTOS_HILLS_MINUTES}`;
  const items = [{ agendaNumber: "A", title: "Resolution Authorizing the City Manager to Execute a Five-Year Law Enforcement Services Agreement", externalId: "item-a" }];
  const sheriff = card("item-a", "Authorize five-year law enforcement services agreement");

  assert.equal(extractDecisionOutcome(sheriff, meetingWithMinutes("carpinteria", "Nov 19, 2026", items, oct22Minutes)), null);
  assert.ok(extractDecisionOutcome(sheriff, meetingWithMinutes("carpinteria", "Oct 22, 2026", items, oct22Minutes)));
  // An approval line names the minutes being approved, not the meeting recorded.
  const approval = `Housing Commission\nD1. Approve the Housing Commission meeting minutes for June 3, 2026\n${LOS_ALTOS_HILLS_MINUTES}`;
  assert.ok(extractDecisionOutcome(sheriff, meetingWithMinutes("menlo-park", "Aug 5, 2026", items, approval)));
});

test("a section heading in ordinary case does not read as a missed section", () => {
  // Los Altos Hills, Aug 10, 2026: section 3 is not uppercase.
  const entries = parseMinutesOutline(`1.PUBLIC COMMENT
2.NEW BUSINESS
A. Resolution Authorizing the City Manager to Submit Payment to the Santa Clara County Sheriff
MOTION PASSED 4-1.
3.Receive Update on Negotiations of the Law Enforcement Agreement with the Santa Clara County Sheriff
1. Continue negotiations regarding the proposed services
4.ADJOURNMENT
`);
  assert.deepEqual(entries.map((entry) => entry.number), ["1", "2", "2.A", "4"]);
  // A speaker list ("4. Malika Junaid") does not cover a missing section.
  assert.deepEqual(parseMinutesOutline("2. PRESENTATIONS\nA. Pathways\n3. Malika Junaid\n4. INFORMATIONAL REPORTS\n"), []);
});
