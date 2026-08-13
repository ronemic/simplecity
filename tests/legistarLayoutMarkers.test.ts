import assert from "node:assert/strict";
import test from "node:test";
import {
  isLegistarLayoutMarker,
  isSantaBarbaraAgendaScaffolding
} from "../lib/sources/legistar";

type Row = Parameters<typeof isLegistarLayoutMarker>[0];

function row(overrides: Partial<Row> = {}): Row {
  return {
    EventItemTitle: null,
    EventItemMatterId: null,
    EventItemActionText: null,
    ...overrides
  };
}

test("Legistar pagination rows are discarded before they can become agenda items", () => {
  // Santa Barbara County event 2577 carries 17 of these; each one previously
  // published its own "Page break" card once summarization failed.
  assert.equal(isLegistarLayoutMarker(row({ EventItemTitle: "page break" })), true);
  assert.equal(isLegistarLayoutMarker(row({ EventItemTitle: "Page Break" })), true);
  assert.equal(isLegistarLayoutMarker(row({ EventItemTitle: "  page  break  " })), true);
  assert.equal(isLegistarLayoutMarker(row({ EventItemTitle: "pagebreak" })), true);
  assert.equal(isLegistarLayoutMarker(row({ EventItemTitle: "page breaks" })), true);
});

test("agenda rows backed by a matter are never treated as layout", () => {
  assert.equal(
    isLegistarLayoutMarker(
      row({
        EventItemTitle:
          "CONFERENCE WITH LEGAL COUNSEL-EXISTING LITIGATION (Paragraph (1) of subdivision (d))",
        EventItemMatterId: 29224
      })
    ),
    false
  );
});

test("procedural and boilerplate rows are preserved, not swept up with layout markers", () => {
  // The filter is deliberately narrow. These carry no matter record either, and
  // a broader "drop rows without a matter" rule would silence all of them.
  const preserved = [
    "Closed Session",
    "Board Meeting Procedures",
    "Administrative Agenda",
    "Hearing Requests",
    "ADDENDUM",
    "Item A-58) on the Administrative Agenda is amended, as follows:",
    "Departmental Item No. 6 will not be considered prior to 2:00 PM",
    "Adjourned at 4:15 PM Adjourned to Tuesday, August 18, 2026",
    "The meeting of Tuesday, August 18, 2026 will be telecast live on County of Santa Barbara TV",
    "http://www.countyofsb.org"
  ];

  for (const title of preserved) {
    assert.equal(
      isLegistarLayoutMarker(row({ EventItemTitle: title })),
      false,
      `expected ${title} to survive the layout-marker filter`
    );
  }
});

test("a recorded action or matter always outranks the title check", () => {
  // Defensive: if a clerk ever files real minutes text against a row that is
  // still titled "page break", the recorded action wins and the row survives.
  assert.equal(
    isLegistarLayoutMarker(
      row({
        EventItemTitle: "page break",
        EventItemActionText: "Received and filed staff presentations regarding Departmental Budgets."
      })
    ),
    false
  );
  assert.equal(
    isLegistarLayoutMarker(row({ EventItemTitle: "page break", EventItemMatterId: 12345 })),
    false
  );
});

test("rows with no title at all are left alone", () => {
  // An untitled row is not provably worthless, so it is not this filter's call.
  assert.equal(isLegistarLayoutMarker(row()), false);
  assert.equal(isLegistarLayoutMarker(row({ EventItemTitle: "" })), false);
});

test("Santa Barbara agenda scaffolding is discarded", () => {
  // Every one of these recurs verbatim in at least 3 of 33 sampled meetings and
  // carries no matter and no recorded action — template text, not a decision.
  const scaffolding = [
    "Closed Session",
    "Recess to Closed Session",
    "Recessed to Closed Session",
    "Board Meeting Procedures",
    "Late Distribution and Ex-Parte Communication",
    "Disclosure of Campaign Contributions",
    "Disability Access and Accommodation Requests",
    "Disability Access",
    "Challenges",
    "IF YOU CHALLENGE A DETERMINATION MADE ON A MATTER ON THIS AGENDA IN COURT, YOU MAY BE LIMITED",
    "All matters listed hereunder constitute a consent agenda, and will be acted upon by a single vote",
    "http://www.countyofsb.org",
    "County Executive Officer's Report",
    "Departmental Agenda\r\nPlanning Items and Public Hearings",
    "Administrative Agenda",
    "Administrative Items",
    "Administrative Item",
    "Approval of Administrative Agenda",
    "Resolutions to be Presented",
    "Honorary Resolutions",
    "Hearing Requests",
    "Board of Supervisors",
    "County Administration Building Board Hearing Room 105 East Anapamu Street",
    "Joseph Centeno Betteravia Government Administration Building Board Hearing Room",
    "9:00 A.M. ..... Convene to Regular Session",
    "9:00 A.M. ..... Convened to Regular Session",
    "12:00 P.M. ..... Recessed to Closed Session",
    "ADDENDUM"
  ];

  for (const title of scaffolding) {
    assert.equal(
      isSantaBarbaraAgendaScaffolding(row({ EventItemTitle: title })),
      true,
      `expected scaffolding: ${title}`
    );
  }
});

test("a matter or a recorded action always rescues a scaffolding title", () => {
  // This is the guard that makes the list safe. "Report from Closed Session" is
  // scaffolding when empty, but once the clerk files the outcome it is the public
  // record of the Board authorizing litigation — it must survive.
  assert.equal(
    isSantaBarbaraAgendaScaffolding(
      row({
        EventItemTitle: "Closed Session",
        EventItemActionText:
          "In Closed Session, the Board authorized unanimously to initiate civil litigation."
      })
    ),
    false
  );
  assert.equal(
    isSantaBarbaraAgendaScaffolding(
      row({ EventItemTitle: "Administrative Agenda", EventItemMatterId: 29224 })
    ),
    false
  );
});

test("substantive and meeting-specific rows are not scaffolding", () => {
  // The filter targets the recurring template only. One-off rows carry real
  // meeting detail (dates, locations, budget structure) and stay.
  const preserved = [
    "CONFERENCE WITH LEGAL COUNSEL-EXISTING LITIGATION",
    "Consider recommendations regarding the Santa Barbara County Housing Element",
    "Report from Closed Session",
    "Adjourned at 4:15 PM Adjourned to Tuesday, August 18, 2026",
    "The meeting of Tuesday, August 18, 2026 will be telecast live on County of Santa Barbara TV",
    "Budget Workshop Santa Barbara County Fiscal Year 2026-2027",
    "Item A-58) on the Administrative Agenda is amended, as follows:",
    "Departmental Item No. 6 will not be considered prior to 2:00 PM",
    "The Closed Session Agenda is amended, as follows:"
  ];

  for (const title of preserved) {
    assert.equal(
      isSantaBarbaraAgendaScaffolding(row({ EventItemTitle: title })),
      false,
      `expected preserved: ${title}`
    );
  }
});

test("an empty or missing title is not scaffolding", () => {
  assert.equal(isSantaBarbaraAgendaScaffolding(row()), false);
  assert.equal(isSantaBarbaraAgendaScaffolding(row({ EventItemTitle: "   " })), false);
});
