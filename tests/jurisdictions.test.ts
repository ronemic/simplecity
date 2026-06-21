import assert from "node:assert/strict";
import test from "node:test";
import {
  getDefaultJurisdiction,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "../lib/config/jurisdictions";

test("the first-time jurisdiction defaults to San Mateo in data and navigation", () => {
  const defaultJurisdiction = getDefaultJurisdiction();

  assert.equal(defaultJurisdiction.slug, "san-mateo-city");
  assert.equal(normalizeJurisdictionSelection(undefined), "san-mateo-city");
  assert.equal(toPublicJurisdictionSlug(defaultJurisdiction.slug), "san-mateo");
});
