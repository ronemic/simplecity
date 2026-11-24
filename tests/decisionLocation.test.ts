import assert from "node:assert/strict";
import test from "node:test";
import {
  extractStreetAddressCandidate,
  geocodeDecisionAddress,
  labelMatchesAddress
} from "@/lib/maps/decisionLocation";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";

const jurisdiction = {
  name: "Mountain View",
  slug: "mountain-view",
  officialName: "City of Mountain View",
  regionSlug: "santa-clara",
  platform: "legistar",
  timezone: "America/Los_Angeles",
  sourceUrl: "https://example.com"
} as JurisdictionConfig;

test("extracts an explicit project street address with source evidence", () => {
  const candidate = extractStreetAddressCandidate(
    "Approve a development permit for 123 Castro Street with twelve new homes."
  );

  assert.equal(candidate?.address, "123 Castro Street");
  assert.match(candidate?.evidence || "", /development permit/);
});

test("does not confuse meeting and public-comment addresses with project locations", () => {
  assert.equal(
    extractStreetAddressCandidate("Attend the meeting at 500 Castro Street and submit comments."),
    null
  );
});

test("accepts a matching geocoder result inside the jurisdiction region", async () => {
  const candidate = extractStreetAddressCandidate("Project at 123 Castro Street.");
  assert.ok(candidate);

  const result = await geocodeDecisionAddress(candidate, jurisdiction, {
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({
        features: [{
          center: [-122.08, 37.39],
          place_name: "123 Castro Street, Mountain View, California",
          relevance: 0.97
        }]
      }))
  });

  assert.equal(result?.location_status, "verified");
  assert.equal(result?.location_latitude, 37.39);
  assert.equal(result?.location_longitude, -122.08);
});

test("rejects a geocoder result outside the jurisdiction region", async () => {
  const candidate = extractStreetAddressCandidate("Project at 123 Castro Street.");
  assert.ok(candidate);

  const result = await geocodeDecisionAddress(candidate, jurisdiction, {
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({
        features: [{
          center: [-118.24, 34.05],
          place_name: "123 Castro Street, Los Angeles, California",
          relevance: 0.99
        }]
      }))
  });

  assert.equal(result?.location_status, "geocode_failed");
});

test("skips payment registers whose vendor lines name unrelated addresses", () => {
  const candidate = extractStreetAddressCandidate(
    [
      "Official title: City/District Warrant of Demands were Processed and Issued on July 30, 2026",
      "Item context: 158356 BAY SOLUTIONS JUNK REMOVAL:633 COMET DR $900.00 158357 BAYSIDE BUILDING MATERIALS"
    ].join("\n")
  );

  assert.equal(candidate, null);
});

test("skips minutes and adjournment items that carry city-hall boilerplate", () => {
  assert.equal(
    extractStreetAddressCandidate(
      "Official title: JUNE 18, 2026 REGULAR MEETING MINUTES\nItem context: Council discussed 613 Portsmouth Lane."
    ),
    null
  );
  assert.equal(
    extractStreetAddressCandidate("Official title: ADJOURNMENT\nItem context: 610 Foster City Boulevard."),
    null
  );
});

test("suppresses non-site items backfilled from a bare agenda title", () => {
  assert.equal(extractStreetAddressCandidate("Cash Disbursement Report for June 2026"), null);
});

test("keeps a project location when the body merely mentions a non-site word", () => {
  const candidate = extractStreetAddressCandidate(
    [
      "Official title: Vote on use permit for 613 Portsmouth Lane addition",
      "Item context: The prior meeting minutes recorded neighbor comments about 613 Portsmouth Lane."
    ].join("\n")
  );

  assert.equal(candidate?.address, "613 Portsmouth Lane");
});

test("drops the agenda item number that runs into the address", () => {
  assert.equal(
    extractStreetAddressCandidate("Item context: CONSENT CALENDAR. 15 445 S. B Street (Bespoke) mixed-use.")?.address,
    "445 S. B Street"
  );
  // A dotted sub-number sits between the item number and the address.
  assert.equal(
    extractStreetAddressCandidate("Item context: 2 4.2. 27440 Elena Road variance study session.")?.address,
    "27440 Elena Road"
  );
});

test("never trims past intervening words, where letterhead and table rows live", () => {
  // Staff-report footer: "Page 1 of 4" followed by the city's own letterhead.
  assert.equal(
    extractStreetAddressCandidate("Item context: Page 1 of 4 City of Redwood City 1017 Middlefield Road")?.address,
    "4 City of Redwood City 1017 Middlefield Road"
  );
  // One row of an assessment-appeal table, which names an unrelated property.
  assert.equal(
    extractStreetAddressCandidate("Item context: STRYKER (TENANT) N 24 Y 24.2346 2610 ORCHARD PARKWAY")?.address,
    "24 Y 24.2346 2610 ORCHARD PARKWAY"
  );
});

test("leaves a street with no house number rather than claiming address precision", () => {
  assert.equal(
    extractStreetAddressCandidate("Item context: CONSENT CALENDAR. 13 19th Avenue multimodal project.")?.address,
    "13 19th Avenue"
  );
});

test("keeps an address range intact and geocodes it by its low number", async () => {
  const candidate = extractStreetAddressCandidate(
    "Item context: Landmark designation for the storefronts at 2035-2047 Fillmore Street."
  );
  assert.equal(candidate?.address, "2035-2047 Fillmore Street");

  let requested = "";
  const result = await geocodeDecisionAddress(candidate!, jurisdiction, {
    apiKey: "test-key",
    fetchImpl: async (input) => {
      requested = decodeURIComponent(String(input));
      return new Response(JSON.stringify({
        features: [{
          center: [-122.08, 37.39],
          place_name: "2035 Fillmore Street, Mountain View, California",
          relevance: 1
        }]
      }));
    }
  });

  assert.match(requested, /2035 Fillmore Street, Mountain View/);
  assert.doesNotMatch(requested, /2035-2047/);
  assert.equal(result?.location_status, "verified");
});

test("does not read a split ordinal as a house number on an unnamed street", () => {
  // Agenda PDFs break "1st" and "3rd" apart, leaving "1 st" and "3 rd" -- a
  // number followed by what looks like a street suffix but no street name. The
  // geocoder answered these with 1 Main Street and 3 Farm Road in Los Altos.
  assert.equal(
    extractStreetAddressCandidate(
      "Official title: Topics for future meetings: - Monday November 7, 2026-Recommend FIC Workplan/Council Priorities 2027- 2028; 1 st\nAgenda section: Not listed in the source document."
    ),
    null
  );
  assert.equal(
    extractStreetAddressCandidate(
      "Staff: Jay Bradford, Community Development Director Continued from September 3 rd , 2026, Planning Commission Special Meeting"
    ),
    null
  );
  // Each of these was geocoded to some unrelated street sharing the number.
  for (const text of [
    "Agenda section: NEW BUSINESS. 2 Dr. Martin Luther King Jr. Community Center Modernization",
    "funded with the Senate Bill 1 Road Maintenance and Rehabilitation Account funds",
    "Accept Hunters View HOPE SF Phase 2 street infrastructure",
    "located on Chynoweth Board of Supervisors: Page 2 of 3 Agenda Date: June 23, 2026 Avenue, in the City of San José"
  ]) {
    assert.equal(extractStreetAddressCandidate(text), null, text);
  }
});

test("does not start a house number inside a comma-grouped amount", () => {
  // "$68,400" is a dollar figure, not 400 on some street; the geocoder pinned
  // this Otay Avenue repair at 400 30th Avenue.
  assert.equal(
    extractStreetAddressCandidate("Establish $68,400 contingency for Otay Avenue slide repair project"),
    null
  );
});

test("finds the real address after a comma-grouped square footage", () => {
  assert.equal(
    extractStreetAddressCandidate(
      "with buildings totaling approximately 22,965 square feet located at 125 Bayshore Boulevard, with W.Y."
    )?.address,
    "125 Bayshore Boulevard"
  );
});

test("does not read the agenda item's own number as a house number", () => {
  // Item 23 was pinned at "23 Humboldt Court, Pacifica".
  assert.equal(
    extractStreetAddressCandidate(
      [
        "Agenda item 23",
        "Official title: Humboldt Street Bike Lanes Alternatives — Update and Direction",
        "Agenda section: OLD BUSINESS",
        "Item context: Agenda section: OLD BUSINESS. 23 Humboldt Street Bike Lanes Alternatives — Update and Direction Receive an informational update."
      ].join("\n")
    ),
    null
  );
  // The same index still drops off an address that follows it.
  assert.equal(
    extractStreetAddressCandidate(
      "Agenda item 15\nItem context: Agenda section: CONSENT CALENDAR. 15 445 S. B Street (Bespoke) mixed-use."
    )?.address,
    "445 S. B Street"
  );
  // A real address that shares the number but is not at the head of the item stays.
  assert.equal(
    extractStreetAddressCandidate(
      "Agenda item 23\nItem context: Agenda section: NEW BUSINESS. Approve a permit for 23 Humboldt Street."
    )?.address,
    "23 Humboldt Street"
  );
});

test("ignores addresses from the next agenda item that ran into this one's context", () => {
  // The sales tax survey (item 24) was pinned at item 25's housing site.
  const text = [
    "Agenda item 24",
    "Official title: Tracking Survey Results for the Potential Sales Tax Measure for November 2026 — Informational",
    "Item context: Agenda section: NEW BUSINESS. 24 Tracking Survey Results — Informational Receive a presentation. DOWNLOAD PUBLIC HEARING City Council action. 25. \u200bNew Multi-Family Residential Development (PA-2025-063) — Approval for 232 units at 220 W. 20th Avenue.",
    "Official source: "
  ].join("\n");
  assert.equal(extractStreetAddressCandidate(text), null);

  // An address inside the item's own context is still found.
  assert.equal(
    extractStreetAddressCandidate(text.replace("Receive a presentation.", "Receive a presentation at 330 W. 20th Avenue."))?.address,
    "330 W. 20th Avenue"
  );
});

test("requires the geocoder's label to name the street the source named", async () => {
  const pacifica = "23 Humboldt Court, Pacifica, California 94044, United States";
  assert.equal(labelMatchesAddress(pacifica, "23 Humboldt Street"), false);
  assert.equal(labelMatchesAddress("220 W 20th Avenue, San Mateo, California", "220 W. 20th Ave"), true);
  assert.equal(labelMatchesAddress("616 South B Street, San Mateo, California", "616 S. B Street"), true);
  assert.equal(labelMatchesAddress("349 1st Street, Los Altos, California", "349 First Street"), true);
  // Unincorporated land is labelled by the county seat; the street still matches.
  assert.equal(labelMatchesAddress("421 Patterson Road, Santa Barbara, California 93455", "421 Patterson Road"), true);
  // The source may run on past the street, but may not start somewhere else.
  assert.equal(labelMatchesAddress("10320 Rolly Road, Los Altos Hills, California", "10320 Rolly Road for the Rolly Road"), true);
  assert.equal(
    labelMatchesAddress("6 Thompson Street, Hollister, California", "6 that conveyance of easements at 920 Thompson Street"),
    false
  );
  assert.equal(labelMatchesAddress("25, California, United States", "25 miles-per-hour speed limit is warranted for this road"), false);

  const candidate = extractStreetAddressCandidate("Project at 23 Humboldt Street.");
  assert.ok(candidate);
  const result = await geocodeDecisionAddress(candidate, { ...jurisdiction, name: "San Mateo", regionSlug: "south-san-mateo" }, {
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({
        features: [{
          center: [-122.468333, 37.583626],
          place_name: pacifica,
          relevance: 0.73
        }]
      }))
  });
  assert.equal(result?.location_status, "geocode_failed");
});

test("skips staff-report letterheads and pins the project named after them", () => {
  const candidate = extractStreetAddressCandidate(
    "Official title: Accept grant for Belle Haven Child Development Center\n" +
      "Item context: Library and Community Services City of Menlo Park 701 Laurel St., Menlo Park, CA 94025 " +
      "tel 650-330-6600 www.menlopark.gov STAFF REPORT Staff Report Number: 26-190-CC " +
      "Recommendation: accept the grant to electrify the Belle Haven Child Development Center at 410 Ivy Dr."
  );
  assert.equal(candidate?.address, "410 Ivy Dr");

  assert.equal(
    extractStreetAddressCandidate(
      "Official title: Update on major project status\n" +
        "Item context: E1 Update on major project status City of Menlo Park 701 Laurel St., Menlo Park Item context"
    ),
    null
  );
  assert.equal(
    extractStreetAddressCandidate(
      "Official title: Human Trafficking Task Force report\n" +
        "Item context: Office of the District Attorney 70 West Hedding Street, West Wing, 5 th Floor San Jose, " +
        "California 95110 (408) 299-7400 Jeffrey F. Rosen District Attorney"
    ),
    null
  );
});

test("skips venue and on-file addresses of civic buildings", () => {
  for (const text of [
    "Official title: Approve 2027 meeting schedule\nItem context: Meetings are held in the Isaac Newton Senter Auditorium, 70 West Hedding Street, San Jose.",
    "Official title: Shield Wildfire Detection Sensors update\nItem context: Reports are available for inspection at Town Hall, 26379 Fremont Road and the Los Altos Main Library.",
    "Official title: Award contract for Foothill Bridge storm repair\nItem context: Approve the Project Plans and Specifications, on file in the Public Works Department Office, located at 123 E. Anapamu Street, Santa Barbara.",
    "Official title: Reimburse Veolia for water system improvements\nItem context: The report is on a bulletin board located at City Hall: 2415 University Avenue, East Palo Alto.",
    "Official title: Approve agreement\nItem context: 7M General Engineering, Inc. with its principal place of business located at 1479 Saratoga Avenue, Suite 110, San Jose."
  ]) {
    assert.equal(extractStreetAddressCandidate(text), null, text);
  }
});

test("gives minutes approvals and adjournments no pin", () => {
  for (const title of [
    "Approve November 9, 2026 City Council minutes",
    "Adjourn – Next meeting scheduled Feb 3, 2027 in the Senter Auditorium, 70 West Hedding Street"
  ]) {
    assert.equal(
      extractStreetAddressCandidate(
        `Official title: ${title}\nItem context: DRAFT MINUTES COUNCIL MEMBER ISABELLA CHU 1017 MIDDLEFIELD ROAD REDWOOD CITY, CA`
      ),
      null,
      title
    );
  }
});

test("keeps a civic-building address when the item is about that building", () => {
  const candidate = extractStreetAddressCandidate(
    "Official title: Fast Track Site Development at 26379 W Fremont Rd\n" +
      "Item context: Copies are available for inspection at Town Hall, 26379 W Fremont Rd."
  );
  assert.equal(candidate?.address, "26379 W Fremont Rd");
  assert.equal(
    extractStreetAddressCandidate("Approve a development permit for 123 Castro Street; the Department recommends approval.")?.address,
    "123 Castro Street"
  );
});
