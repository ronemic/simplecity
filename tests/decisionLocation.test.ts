import assert from "node:assert/strict";
import test from "node:test";
import {
  extractStreetAddressCandidate,
  geocodeDecisionAddress
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
