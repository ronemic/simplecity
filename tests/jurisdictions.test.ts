import assert from "node:assert/strict";
import test from "node:test";
import {
  getDefaultJurisdiction,
  getJurisdictionBySlug,
  getPublicJurisdictionOptions,
  getServiceSupabaseClientForJurisdiction,
  normalizeJurisdictionSelection,
  requireValidJurisdictionSlug,
  SAN_FRANCISCO_MISSING_SUPABASE_CONFIG_MESSAGE,
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

test("San Francisco is a valid Legistar jurisdiction", () => {
  const sanFrancisco = getJurisdictionBySlug("san-francisco");

  assert.equal(requireValidJurisdictionSlug("san-francisco"), "san-francisco");
  assert.equal(sanFrancisco?.name, "San Francisco");
  assert.equal(sanFrancisco?.officialName, "City and County of San Francisco");
  assert.equal(sanFrancisco?.platform, "legistar");
  assert.equal(sanFrancisco?.timezone, "America/Los_Angeles");
  assert.equal(sanFrancisco?.sourceUrl, "https://sfgov.legistar.com/Calendar.aspx");
  assert.equal(sanFrancisco?.legistarUrl, "https://sfgov.legistar.com/Calendar.aspx");
  assert.equal(toPublicJurisdictionSlug("san-francisco"), "san-francisco");
  assert.ok(
    getPublicJurisdictionOptions().some(
      (option) => option.slug === "san-francisco" && option.name === "San Francisco"
    )
  );
});

test("San Francisco service client requires its own Supabase config", () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SAN_FRANCISCO_SUPABASE_SERVICE_ROLE_KEY
  };

  delete process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_ANON_KEY;
  delete process.env.SAN_FRANCISCO_SUPABASE_SERVICE_ROLE_KEY;

  try {
    assert.throws(
      () => getServiceSupabaseClientForJurisdiction("san-francisco"),
      (error) =>
        error instanceof Error &&
        error.message === SAN_FRANCISCO_MISSING_SUPABASE_CONFIG_MESSAGE
    );
  } finally {
    if (previous.url === undefined) {
      delete process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_URL = previous.url;
    }

    if (previous.anonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_ANON_KEY = previous.anonKey;
    }

    if (previous.serviceRoleKey === undefined) {
      delete process.env.SAN_FRANCISCO_SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SAN_FRANCISCO_SUPABASE_SERVICE_ROLE_KEY = previous.serviceRoleKey;
    }
  }
});
