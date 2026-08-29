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
