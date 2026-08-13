import assert from "node:assert/strict";
import test from "node:test";
import { isLegistarLayoutMarker } from "../lib/sources/legistar";

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
