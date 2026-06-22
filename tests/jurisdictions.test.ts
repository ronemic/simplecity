import assert from "node:assert/strict";
import test from "node:test";
import {
  getDefaultJurisdiction,
  getJurisdictionBySlug,
  getPublicJurisdictionOptions,
  normalizeJurisdictionSelection,
  requireValidJurisdictionSlug,
  toPublicJurisdictionSlug
} from "../lib/config/jurisdictions";

test("the first-time jurisdiction defaults to San Mateo in data and navigation", () => {
  const defaultJurisdiction = getDefaultJurisdiction();

  assert.equal(defaultJurisdiction.slug, "san-mateo-city");
  assert.equal(normalizeJurisdictionSelection(undefined), "san-mateo-city");
  assert.equal(toPublicJurisdictionSlug(defaultJurisdiction.slug), "san-mateo");
});

test("lists Mountain View between San Mateo County and Santa Clara County", () => {
  const slugs = getPublicJurisdictionOptions().map((jurisdiction) => jurisdiction.slug);

  assert.ok(slugs.indexOf("san-mateo-county") < slugs.indexOf("mountain-view"));
  assert.ok(slugs.indexOf("mountain-view") < slugs.indexOf("santa-clara-county"));
});

test("Mountain View is a valid Legistar jurisdiction", () => {
  const mountainView = getJurisdictionBySlug("mountain-view");

  assert.equal(requireValidJurisdictionSlug("mountain-view"), "mountain-view");
  assert.equal(mountainView?.name, "Mountain View");
  assert.equal(mountainView?.platform, "legistar");
  assert.equal(mountainView?.sourceUrl, "https://mountainview.legistar.com/Calendar.aspx");
  assert.equal(toPublicJurisdictionSlug("mountain-view"), "mountain-view");
  assert.ok(
    getPublicJurisdictionOptions().some(
      (option) => option.slug === "mountain-view" && option.name === "Mountain View"
    )
  );
});
