import assert from "node:assert/strict";
import test from "node:test";
import {
  getJurisdictions,
  PUBLIC_JURISDICTION_OPTIONS
} from "@/lib/config/jurisdictions";
import { parseSantaBarbaraCityAgendaItems, parseSantaBarbaraCityInventory } from "@/lib/sources/santa-barbara-city";
import { isSantaMariaSectionHeading } from "@/lib/sources/escribe";
import { parseLompocAgendaItems, parseLompocCouncilRows } from "@/lib/sources/lompoc";
import {
  buildGuadalupeMeetings,
  classifyGuadalupeDocument,
  enrichGuadalupeMeetings,
  guadalupeAttachmentItemNumber,
  guadalupeItemAttachmentDocuments,
  guadalupeAgendaLines,
  parseGuadalupeAgendaHeader,
  parseGuadalupeAgendaItems,
  type GuadalupeDocumentPost
} from "@/lib/sources/guadalupe";
import { isPrimeGovTestMeeting } from "@/lib/scraper/primegov";
import { parseSolvangAgendaItems } from "@/lib/sources/solvang";
import { civicClerkApiBase, civicClerkItemsFromAgenda } from "@/lib/sources/civicclerk-agenda-api";

test("the Santa Barbara cities share the county's regional database configuration", () => {
  const cities = ["santa-maria", "santa-barbara-city", "lompoc", "goleta", "carpinteria", "guadalupe", "solvang"];
  const jurisdictions = getJurisdictions();
  const county = jurisdictions.find((jurisdiction) => jurisdiction.slug === "santa-barbara-county");
  assert.ok(county);
  for (const slug of cities) {
    const city = jurisdictions.find((jurisdiction) => jurisdiction.slug === slug);
    assert.ok(city, `${slug} is configured`);
    assert.equal(city.regionSlug, "santa-barbara");
    assert.equal(city.supabaseUrl, county.supabaseUrl);
    assert.equal(city.supabaseAnonKey, county.supabaseAnonKey);
    assert.equal(city.supabaseServiceRoleKey, county.supabaseServiceRoleKey);
    assert.equal(PUBLIC_JURISDICTION_OPTIONS.find((option) => option.slug === slug)?.parentCountySlug,
      "santa-barbara-county");
  }
});

test("Lompoc calendar links the official council event to its agenda PDF", () => {
  const html = '<table><tr><td class="event_title"><a href="/Home/Components/Calendar/Event/8599/67"><span itemprop="summary">Council Meeting</span></a></td>' +
    '<td class="event_datetime">11/17/2026 6:30 PM - 9:30 PM</td>' +
    '<td class="event_agenda"><a class="agenda_minutes_link" href="/home/showpublisheddocument/50911/639295760008930000">November 17 Draft Agenda</a></td>' +
    '<td class="event_minutes">Not Included</td></tr></table>';
  const rows = parseLompocCouncilRows(html, "https://www.cityoflompoc.com/government/committees-boards/city-council");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].externalId, "lompoc-calendar-8599");
  assert.equal(rows[0].documents[0].url, "https://www.cityoflompoc.com/home/showpublisheddocument/50911/639295760008930000");
});

test("Lompoc agenda parsing retains numbered items across PDF page headings", () => {
  const text = "23. Each televised Council meeting is closed captioned.\n1. Approval of Minutes of the Council Regular Meeting of August 4,\n2026.\n\n11/17/2026 DRAFT Agenda Page 2 of 4\n2. Adoption of a Resolution for Safe Routes.\nRecommendation: Council adopt the resolution.\n";
  const items = parseLompocAgendaItems(text, "https://www.cityoflompoc.com/agenda.pdf", "8599");
  assert.deepEqual(items.map((item) => item.agendaNumber), ["1", "2"]);
  assert.equal(items[0].title, "Approval of Minutes of the Council Regular Meeting of August 4, 2026.");
  assert.equal(items[1].recommendedAction, "Council adopt the resolution.");
});

test("Santa Barbara city reads nested OnBase meeting inventory without losing rows", () => {
  const html = '<script>showSearchResults(new SearchResults({"Meetings":[' +
    '{"ID":1,"Name":"Regular City Council Meeting","MeetingTypeName":"Council","Time":"2026-11-10T14:00:00-08:00","TimeString":"11/10/2026 2:00:00 PM","IsAgendaAvailable":true,"IsMinutesAvailable":false,"Documents":[{"Name":"Agenda {updated}"}]},' +
    '{"ID":2,"Name":"Special Meeting","MeetingTypeName":"Council","Time":"2026-11-11T14:00:00-08:00","TimeString":"11/11/2026 2:00:00 PM","IsAgendaAvailable":false,"IsMinutesAvailable":false}' +
    ']}));</script>';
  assert.deepEqual(parseSantaBarbaraCityInventory(html).map((meeting) => meeting.ID), [1, 2]);
  assert.throws(() => parseSantaBarbaraCityInventory("<html></html>"), /inventory was not found/);
});

test("Santa Barbara city keeps numbered agenda subjects and recommendations together", () => {
  const html = '<p>1. Subject: Adopt a housing plan</p><p>Recommendation: That Council adopt the plan.</p>' +
    '<p>2. Subject: Approve a park contract</p><p>Recommendation: That Council approve the contract.</p>';
  const items = parseSantaBarbaraCityAgendaItems(html, "https://example.gov/agenda", "42");
  assert.deepEqual(items.map((item) => item.agendaNumber), ["1", "2"]);
  assert.equal(items[0].title, "Adopt a housing plan");
  assert.equal(items[1].recommendedAction, "Recommendation: That Council approve the contract.");
  assert.equal(items[1].sourceUrl, "https://example.gov/agenda");
});

test("Santa Maria section labels do not become decision cards", () => {
  assert.equal(isSantaMariaSectionHeading("FINANCE DEPARTMENT"), true);
  assert.equal(isSantaMariaSectionHeading("RECONVENE TO REGULAR SESSION"), true);
  assert.equal(isSantaMariaSectionHeading("REPORT BY CITY MANAGER"), true);
  assert.equal(isSantaMariaSectionHeading("Adoption of a Resolution Approving an Agreement"), false);
});

test("Carpinteria, Guadalupe and Solvang use their official agenda platforms", () => {
  const bySlug = new Map(getJurisdictions().map((jurisdiction) => [jurisdiction.slug, jurisdiction]));
  assert.equal(bySlug.get("carpinteria")?.platform, "civicclerk");
  assert.equal(bySlug.get("carpinteria")?.civicClerkUrl, "https://carpinteriaca.portal.civicclerk.com/");
  assert.equal(bySlug.get("solvang")?.platform, "primegov");
  assert.equal(bySlug.get("solvang")?.primegovUrl, "https://cityofsolvang.primegov.com/public/portal");
  assert.equal(bySlug.get("guadalupe")?.platform, "official-site");
});

test("PrimeGov rehearsal meetings are not treated as public meetings", () => {
  assert.equal(isPrimeGovTestMeeting({ title: "TEST 123" }), true);
  assert.equal(isPrimeGovTestMeeting({ title: "Test City Council Special" }), true);
  assert.equal(isPrimeGovTestMeeting({ title: "City Council Regular Meeting" }), false);
  assert.equal(isPrimeGovTestMeeting({ title: "Testimony Workshop" }), false);
});

function guadalupePost(id: number, title: string, file: string): GuadalupeDocumentPost {
  return {
    id,
    date: "2026-02-20T10:00:00",
    title: { rendered: title },
    meta_box: { city_file_upload: [{ url: `https://cityofguadalupe.org/wp-content/uploads/2026/02/${file}`, name: file }] }
  };
}

test("Guadalupe documents group into same-day regular and special meetings", () => {
  const posts = [
    guadalupePost(1, "CC Agenda 2-24-2026 &#8211; Links", "CC-Agenda-2-24-2026-Links.pdf"),
    guadalupePost(2, "CC Agenda 2-24-2026 &#8211; Packet", "CC-Agenda-2-24-2026-Packet.pdf"),
    guadalupePost(3, "CC Agenda 2-24-2026 &#8211; Special Closed Session Meeting", "CC-Agenda-2-24-2026-Special-Closed-Session-Meeting.pdf"),
    guadalupePost(4, "CC Minutes 2-24-2026 Special Meeting", "CC-Minutes-2-24-2026-Special-Meeting.pdf"),
    guadalupePost(5, "CC Minutes 2-24-2026", "CC-Minutes-2-24-2026.pdf"),
    guadalupePost(6, "Items distributed during 2-24-2026 CC Meeting", "Items.pdf"),
    guadalupePost(7, "CC Agenda 2-8-2025 (Special Meeting)", "CC-Agenda-2-8-2025-Special-Meeting.pdf"),
    guadalupePost(8, "CC Minutes 2-8-2025", "CC-Minutes-2-8-2025.pdf"),
    guadalupePost(9, "CC Agenda 12-23-2025 &#8211; Cancelled", "CC-Agenda-12-23-2025.pdf"),
    guadalupePost(10, "Oversight Board Agenda 2-24-2026", "OB.pdf"),
    { id: 11, date: "2026-02-20T10:00:00", title: { rendered: "CC Agenda 2-24-2026" },
      meta_box: { city_file_upload: [{ url: "https://example.com/CC-Agenda.pdf" }] } }
  ];
  const meetings = buildGuadalupeMeetings(posts, "https://cityofguadalupe.org/council-agendas/", Date.parse("2026-11-10"));
  const byId = new Map(meetings.map((meeting) => [meeting.externalId, meeting]));
  assert.deepEqual([...byId.keys()].sort(), [
    "guadalupe-2025-02-08-special", "guadalupe-2025-12-23-regular",
    "guadalupe-2026-02-24-regular", "guadalupe-2026-02-24-special"
  ]);
  assert.deepEqual(byId.get("guadalupe-2026-02-24-regular")?.documents.map((document) => document.type),
    ["Agenda", "Agenda Packet", "Minutes", "Public Comment"]);
  assert.deepEqual(byId.get("guadalupe-2026-02-24-special")?.documents.map((document) => document.type),
    ["Agenda", "Minutes"]);
  assert.equal(byId.get("guadalupe-2026-02-24-special")?.title, "City Council Special Closed Session Meeting");
  // Minutes titled without "Special" still belong to the only meeting that day.
  assert.deepEqual(byId.get("guadalupe-2025-02-08-special")?.documents.map((document) => document.type),
    ["Agenda", "Minutes"]);
  assert.equal(byId.get("guadalupe-2025-12-23-regular")?.status, "Cancelled");
  assert.equal(classifyGuadalupeDocument(posts[10]), null, "documents off the official host are ignored");
});

test("Guadalupe item documents about cancelling another meeting do not cancel this one", () => {
  const [meeting] = buildGuadalupeMeetings([
    guadalupePost(1, "CC Agenda 11-10-2026 &#8211; Links", "CC-Agenda-11-10-2026-Links.pdf"),
    guadalupePost(2, "CC Agenda 11-10-2026 (Item 6D) Cancellation of the December 22 Council meeting", "6D.pdf")
  ], "https://cityofguadalupe.org/council-agendas/", Date.parse("2026-11-01"));
  assert.equal(meeting.status, "Upcoming");
  assert.deepEqual(meeting.documents.map((document) => document.type), ["Agenda", "Attachment"]);
  assert.equal(classifyGuadalupeDocument(guadalupePost(3, "CC Agenda 11-11-2025 &#8211; Notice of Cancellation", "n.pdf"))?.type,
    "Notice of Cancellation");
});

const GUADALUPE_AGENDA = [
  "November 10, 2026 City of Guadalupe Council Meeting Agenda Page 1 of 3 ",
  "City of Guadalupe ",
  "Regular Meeting of the Guadalupe City Council ",
  "Tuesday, November 10, 2026, at 6:00 p.m. ",
  "City Hall, Council Chambers, 918 Obispo Street, Guadalupe, CA 93434 ",
  "If you choose not to attend, submit comments no later than 2:00 p.m. on Tuesday, November 10, 2026. ",
  "1.ROLL CALL: ",
  "2. PLEDGE OF ALLEGIANCE ",
  "3. COMMUNITY PARTICIPATION FORUM ",
  "4. ",
  "CONSENT CALENDAR (A-D) ",
  "The following items are presented for City Council approval without discussion. ",
  "A. Waive the reading in full of all Ordinances and Resolutions. ",
  "B. Approve payment of warra",
  "nts for the period ending October 23, 2026. ",
  "C. Approve the Minutes of the City Council regular meeting of October 27, 2026. ",
  "D",
  ". Adopt Resolution No. 2026-52 authorizing a State Water Board application. ",
  "ANAGEMENT REPORTS ",
  "5. CITY ADMINISTRATOR: (Information Only) ",
  "A. City Administrator’s report for November 10, 2026. ",
  "November 10, 2026 City of Guadalupe Council Meeting Agenda Page 2 of 3 ",
  "PUBLIC HEARING ",
  "6. Amendments to the Accessory Dwelling Unit (ADU) ordinance (Chapter 18.53). ",
  "Written report: Larry Appel, Contract Planning Director ",
  "Recommendation: That the City Council: ",
  "A. Receive a presentation from staff; and ",
  "B. Introduce Ordinance No. 2026-534. ",
  "7. CLOSED SESSION ",
  "A. Conference with Legal Counsel – Anticipated Litigation ",
  "8. ADJOURNMENT ",
  "I hereby certify that the foregoing agenda was posted. ",
  "PROPOSED FUTURE CITY COUNCIL AGENDA ITEMS ",
  "9. Water and Sewer Rate Study "
].join("\n");

test("Guadalupe agenda parsing keeps real actions and drops procedure and future items", () => {
  const items = parseGuadalupeAgendaItems(GUADALUPE_AGENDA, "https://cityofguadalupe.org/agenda.pdf", "2026-11-10-regular");
  assert.ok(items);
  const decisions = items.filter((item) => item.itemType !== "Section Heading");
  assert.deepEqual(decisions.map((item) => item.agendaNumber), ["4.B", "4.C", "4.D", "6", "7.A"]);
  assert.equal(decisions[0].title, "Approve payment of warrants for the period ending October 23, 2026.");
  assert.equal(decisions[2].title, "Adopt Resolution No. 2026-52 authorizing a State Water Board application.");
  assert.equal(decisions[3].itemType, "Public Hearing");
  assert.equal(decisions[3].title, "Amendments to the Accessory Dwelling Unit (ADU) ordinance (Chapter 18.53).");
  // A lettered recommendation list is part of one item, not separate decisions.
  assert.equal(decisions[3].recommendedAction,
    "That the City Council: A. Receive a presentation from staff; and B. Introduce Ordinance No. 2026-534.");
  assert.equal(items.find((item) => item.agendaNumber === "5")?.itemType, "Section Heading");
  assert.ok(!items.some((item) => /rate study/i.test(item.title || "")), "future agenda items are excluded");
  assert.ok(!items.some((item) => /waive the reading/i.test(item.title || "")));
});

test("Guadalupe agenda parsing refuses an incomplete consent calendar", () => {
  const missingItem = GUADALUPE_AGENDA.replace("C. Approve the Minutes", "Approve the Minutes");
  assert.equal(parseGuadalupeAgendaItems(missingItem, "u", "m"), null);
});

test("Guadalupe agenda header gives the start time and place", () => {
  assert.deepEqual(parseGuadalupeAgendaHeader(GUADALUPE_AGENDA), {
    timeText: "6:00 PM",
    location: "City Hall, Council Chambers, 918 Obispo Street, Guadalupe, CA 93434"
  });
  const following = "Special Closed Session Meeting of the Guadalupe City Council\nTuesday, February 24, 2026\n" +
    "(Following the City Council Regular Meeting that begins at 6:00 p.m.)\nCity Hall, Council Chambers, 918 Obispo Street, Guadalupe CA 93434\n";
  assert.equal(parseGuadalupeAgendaHeader(following).timeText, null);
  assert.equal(parseGuadalupeAgendaHeader("uesday, J uly 14, 2026, at 6:00 p.m.\n").timeText, "6:00 PM");
});

test("Guadalupe line joining repairs split words without gluing real words", () => {
  assert.deepEqual(guadalupeAgendaLines("payment of warra\nnts for the period \nfood trucks and sales carts\nwithin the City \nthe Coalition\nto establish \nPublic Works Proje\nct "),
    ["payment of warrants for the period", "food trucks and sales carts", "within the City", "the Coalition", "to establish", "Public Works Project"]);
});

test("Guadalupe enrichment marks cancellation notices and sets agenda time", () => {
  const [cancelled, regular] = buildGuadalupeMeetings([
    guadalupePost(1, "CC Agenda 12-23-2025 &#8211; Cancelled", "CC-Agenda-12-23-2025.pdf"),
    guadalupePost(2, "CC Agenda 11-10-2026 &#8211; Links", "CC-Agenda-11-10-2026-Links.pdf")
  ], "https://cityofguadalupe.org/council-agendas/", Date.parse("2026-11-01")).sort((a, b) =>
    String(a.externalId).localeCompare(String(b.externalId)));
  cancelled.documents[0].extractedText = "Tuesday, December 23, 2025, at 6:00 pm\nNOTICE OF CANCELLATION\nThe regular meeting has been cancelled.";
  regular.documents[0].extractedText = GUADALUPE_AGENDA;
  enrichGuadalupeMeetings([cancelled, regular]);
  assert.equal(cancelled.status, "Cancelled");
  assert.equal(cancelled.items?.length, 0);
  assert.equal(regular.timeText, "6:00 PM");
  assert.equal(regular.agendaItemInventoryComplete, true);
});

test("Guadalupe agenda links become staff reports on their own items", () => {
  const base = "https://cityofguadalupe.org/wp-content/uploads/2026/11/";
  assert.equal(guadalupeAttachmentItemNumber(`${base}6E.-Authorizing-City-Administrator.pdf`), "6.E");
  assert.equal(guadalupeAttachmentItemNumber(`${base}10.-Amendments-to-the-ADU-ordinance.pdf`), "10");
  assert.equal(guadalupeAttachmentItemNumber(`${base}CC-Agenda-11-10-2026-Packet.pdf`), null);
  const documents = guadalupeItemAttachmentDocuments([
    `${base}6C.-CC-Minutes-10-27-2026.pdf`,
    `${base}6E.-Authorizing-City-Administrator.pdf`,
    `${base}7B.-Planning-Department-report.pdf`,
    `${base}6E.-Authorizing-City-Administrator.pdf`,
    "https://www.youtube.com/channel/abc",
    "https://example.com/6D.-Elsewhere.pdf"
  ], `${base}CC-Agenda-11-10-2026-Links.pdf`);
  assert.deepEqual(documents.map((document) => [document.agendaItemNumber, document.type]),
    [["6.C", "Staff Report"], ["6.E", "Staff Report"], ["7.B", "Staff Report"]]);
  assert.equal(documents[1].label, "6E. Authorizing City Administrator");

  const [meeting] = buildGuadalupeMeetings([guadalupePost(1, "CC Agenda 11-10-2026 &#8211; Links", "CC-Agenda-11-10-2026-Links.pdf")],
    "https://cityofguadalupe.org/council-agendas/", Date.parse("2026-11-01"));
  meeting.documents[0].extractedText = GUADALUPE_AGENDA;
  meeting.documents.push(...guadalupeItemAttachmentDocuments([
    `${base}4D.-State-Water-Board-application.pdf`,
    `${base}5A.-City-Administrator-report.pdf`
  ], meeting.documents[0].url));
  enrichGuadalupeMeetings([meeting]);
  const byNumber = new Map(meeting.items?.map((item) => [item.agendaNumber, item]));
  assert.equal(byNumber.get("4.D")?.attachments?.[0]?.label, "4D. State Water Board application");
  // Information-only reports are folded into their parent heading.
  assert.equal(byNumber.get("5")?.attachments?.[0]?.agendaItemNumber, "5.A");
});

function solvangRow(label: string, title: string, attachments: Array<[string, string]> = [], itemId?: number) {
  const links = attachments.map(([history, name]) =>
    `<div class="attachment-holder"><a href="/api/compilemeetingattachmenthistory/historyattachment/?historyId=${history}" title="Download ${name}">${name}</a></div>`).join("");
  const titleCell = itemId
    ? `<td class="agenda-item" data-itemid="${itemId}"><p>${title}</p><div class="item_contents">${links}</div></td>`
    : `<td><p>${title}</p>${links}</td>`;
  return `<tr><td class="attachmentCell"><div></div></td><td><p>${label}</p></td>${titleCell}<td class="optionalButtonsCell"></td></tr>`;
}

const SOLVANG_URL = "https://cityofsolvang.primegov.com/Portal/Meeting?meetingTemplateId=510";

test("Solvang agenda rows become lettered decisions with their staff reports", () => {
  const html = "<table>" + [
    solvangRow("1.", "PROCLAMATIONS, COMMENDATIONS, AND CEREMONIAL ITEMS:"),
    solvangRow("a.", "Proclamation Honoring Dennis Beebe", [["p1", "Staff Report"]], 835),
    solvangRow("2.", "CITY MANAGER REPORT AND ADVANCE CALENDER", [["f1", "Agenda_Forecast"]]),
    solvangRow("3.", "CONSENT ITEMS"),
    solvangRow("a.", "Approve order of Agenda as presented", [["c1", "Staff Report"]], 822),
    solvangRow("b.", "Approve October Warrants", [["c2", "Staff Report"], ["c3", "October Check Report"]], 837),
    solvangRow("4.", "PUBLIC HEARINGS"),
    solvangRow("5.", "DISCUSSION ITEMS"),
    solvangRow("a.", "Approve Amendment No. 3 with California Consulting, Inc.", [["d1", "Staff Report"]], 834),
    solvangRow("6.", "ELECTION OF CHAIRPERSON AND VICE CHAIRPERSON"),
    solvangRow("7.", "ADJOURNMENT")
  ].join("") + "</table>";
  const items = parseSolvangAgendaItems(html, SOLVANG_URL, "510");
  assert.ok(items);
  const decisions = items.filter((item) => item.itemType !== "Section Heading");
  assert.deepEqual(decisions.map((item) => [item.agendaNumber, item.itemType, item.title]), [
    ["3.b", "Consent Items", "Approve October Warrants"],
    ["5.a", "Discussion Items", "Approve Amendment No. 3 with California Consulting, Inc."],
    ["6", null, "ELECTION OF CHAIRPERSON AND VICE CHAIRPERSON"]
  ]);
  const warrants = decisions[0];
  assert.deepEqual(warrants.attachments?.map((document) => [document.type, document.label]),
    [["Staff Report", "Staff Report"], ["Attachment", "October Check Report"]]);
  assert.equal(warrants.attachments?.[0].url,
    "https://cityofsolvang.primegov.com/api/compilemeetingattachmenthistory/historyattachment/?historyId=c2");
  assert.equal(items.find((item) => item.agendaNumber === "2")?.attachments?.length, 1);
});

test("Solvang combined closed and regular agendas keep both parts distinct", () => {
  const html = "<table>" + [
    solvangRow("1.", "PUBLIC COMMUNICATIONS ON CLOSED SESSION ONLY"),
    solvangRow("2.", "RECESS TO CLOSED SESSION"),
    solvangRow("a.", "CONFERENCE WITH LABOR NEGOTIATORS", [], 1),
    solvangRow("3.", "ADJOURNMENT"),
    solvangRow("1.", "CONSENT ITEMS"),
    solvangRow("a.", "Approve December Warrants", [], 2),
    solvangRow("1.", "DISCUSSION ITEMS"),
    solvangRow("a.", "Sign Ordinance Amendments", [], 3),
    solvangRow("2.", "ADJOURNMENT")
  ].join("") + "</table>";
  const items = parseSolvangAgendaItems(html, SOLVANG_URL, "665");
  assert.ok(items);
  const decisions = items.filter((item) => item.itemType !== "Section Heading");
  assert.deepEqual(decisions.map((item) => [item.agendaNumber, item.itemType]),
    [["CS 2.a", "Closed Session"], ["1.a", "Consent Items"], ["1.a", "Discussion Items"]]);
  assert.equal(new Set(items.map((item) => item.externalId)).size, items.length, "source IDs stay unique");
});

test("Solvang agenda parsing refuses skipped numbering", () => {
  const html = "<table>" + solvangRow("1.", "CONSENT ITEMS") + solvangRow("a.", "Approve Warrants", [], 1) +
    solvangRow("c.", "Approve Minutes", [], 2) + "</table>";
  assert.equal(parseSolvangAgendaItems(html, SOLVANG_URL, "1"), null);
});

test("CivicClerk agenda API items keep sections and public attachment links", () => {
  assert.equal(civicClerkApiBase("https://carpinteriaca.portal.civicclerk.com/"), "https://carpinteriaca.api.civicclerk.com/v1");
  const signed = "https://civicclerk.blob.core.windows.net/stream/CARPINTERIACA/abc.pdf?sp=rw&sig=secret";
  const { items, downloadUrls } = civicClerkItemsFromAgenda([
    { id: 1, agendaObjectItemName: "Closed Session Matters", isSection: 1, childItems: [
      { id: 2, agendaObjectItemOutlineNumber: "1.", agendaObjectItemName: "PUBLIC EMPLOYEE PERFORMANCE EVALUATION<br>Title: City Manager" }
    ] },
    { id: 3, agendaObjectItemName: "Introductions, Proclamations and Presentations", isSection: 1, childItems: [
      { id: 4, agendaObjectItemOutlineNumber: "2.", agendaObjectItemName: "A Proclamation Recognizing Retired Teacher&rsquo;s Week" }
    ] },
    { id: 5, agendaObjectItemName: "Consent Calendar", isSection: 1, childItems: [
      { id: 6, agendaObjectItemOutlineNumber: "3.", agendaObjectItemName: "Receive and file the Warrant Register.",
        attachmentsList: [{ id: 5586, fileName: "Agenda Item No. 3 - Staff Report", pdfVersionFullPath: signed }] }
    ] },
    { id: 7, agendaObjectItemName: "Administrative Matters:", isSection: 1, childItems: [
      { id: 8, agendaObjectItemOutlineNumber: "4.", agendaObjectItemName: "Resolution No. 6501, approving a grant application." }
    ] }
  ], { portalUrl: "https://carpinteriaca.portal.civicclerk.com/", eventId: "28", meetingExternalId: "carpinteria-civicclerk-event-28" });
  assert.deepEqual(items.map((item) => [item.agendaNumber, item.itemType]),
    [["1", "Closed Session"], ["2", "Section Heading"], ["3", "Consent Calendar"], ["4", "Administrative Matters"]]);
  assert.equal(items[0].title, "PUBLIC EMPLOYEE PERFORMANCE EVALUATION Title: City Manager");
  assert.equal(items[1].title, "A Proclamation Recognizing Retired Teacher’s Week");
  const attachment = items[2].attachments?.[0];
  assert.equal(attachment?.type, "Staff Report");
  // The public link is the portal page; the signed write-capable blob URL is only used to download.
  assert.equal(attachment?.url, "https://carpinteriaca.portal.civicclerk.com/event/28/files/attachment/5586");
  assert.ok(!JSON.stringify(items).includes("sig=secret"));
  assert.equal(downloadUrls.get(attachment?.url || ""), signed);
});
