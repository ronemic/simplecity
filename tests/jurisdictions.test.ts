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
  SANTA_CLARA_REGION_MISSING_SUPABASE_CONFIG_MESSAGE,
  toPublicJurisdictionSlug
} from "../lib/config/jurisdictions";

test("the first-time jurisdiction defaults to San Mateo in data and navigation", () => {
  const defaultJurisdiction = getDefaultJurisdiction();

  assert.equal(defaultJurisdiction.slug, "san-mateo-city");
  assert.equal(normalizeJurisdictionSelection(undefined), "san-mateo-city");
  assert.equal(toPublicJurisdictionSlug(defaultJurisdiction.slug), "san-mateo");
});

test("groups alphabetized cities beneath their clickable counties", () => {
  const options = getPublicJurisdictionOptions();

  assert.deepEqual(
    options
      .filter((jurisdiction) => jurisdiction.parentCountySlug === "san-mateo-county")
      .map((jurisdiction) => jurisdiction.slug),
    ["east-palo-alto", "foster-city", "menlo-park", "redwood-city", "san-mateo"]
  );
  assert.deepEqual(
    options
      .filter((jurisdiction) => jurisdiction.parentCountySlug === "santa-clara-county")
      .map((jurisdiction) => jurisdiction.slug),
    ["los-altos", "mountain-view"]
  );
  assert.equal(
    options.find((jurisdiction) => jurisdiction.slug === "san-mateo-county")?.parentCountySlug,
    undefined
  );
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

test("Los Altos is a valid CivicClerk jurisdiction in the Santa Clara region", () => {
  const losAltos = getJurisdictionBySlug("los-altos");

  assert.equal(requireValidJurisdictionSlug("los-altos"), "los-altos");
  assert.equal(losAltos?.name, "Los Altos");
  assert.equal(losAltos?.officialName, "City of Los Altos");
  assert.equal(losAltos?.platform, "civicclerk");
  assert.equal(losAltos?.regionSlug, "santa-clara");
  assert.equal(losAltos?.timezone, "America/Los_Angeles");
  assert.equal(losAltos?.sourceUrl, "https://losaltosca.portal.civicclerk.com/");
  assert.equal(toPublicJurisdictionSlug("los-altos"), "los-altos");
  assert.ok(
    getPublicJurisdictionOptions().some(
      (option) => option.slug === "los-altos" && option.name === "Los Altos"
    )
  );
});

test("Los Altos uses only Santa Clara regional Supabase credentials", () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY
  };

  process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL = "https://santa-clara.example.test";
  process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_ANON_KEY = "regional-anon-key";
  process.env.SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY = "regional-service-key";

  try {
    const losAltos = getJurisdictionBySlug("los-altos");
    assert.equal(losAltos?.supabaseUrl, "https://santa-clara.example.test");
    assert.equal(losAltos?.supabaseAnonKey, "regional-anon-key");
    assert.equal(losAltos?.supabaseServiceRoleKey, "regional-service-key");
  } finally {
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL = previous.url;
    if (previous.anonKey === undefined) delete process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_ANON_KEY = previous.anonKey;
    if (previous.serviceRoleKey === undefined) delete process.env.SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY = previous.serviceRoleKey;
  }
});

test("Los Altos reports missing Santa Clara regional configuration", () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY
  };
  delete process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_ANON_KEY;
  delete process.env.SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY;

  try {
    assert.throws(
      () => getServiceSupabaseClientForJurisdiction("los-altos"),
      (error) =>
        error instanceof Error &&
        error.message === SANTA_CLARA_REGION_MISSING_SUPABASE_CONFIG_MESSAGE
    );
  } finally {
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL = previous.url;
    if (previous.anonKey === undefined) delete process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_ANON_KEY = previous.anonKey;
    if (previous.serviceRoleKey === undefined) delete process.env.SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY = previous.serviceRoleKey;
  }
});

test("regional credentials route jurisdictions without changing their public identity", () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.NORTH_SAN_MATEO_SUPABASE_SERVICE_ROLE_KEY
  };

  process.env.NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_URL = "https://north-san-mateo.example.test";
  process.env.NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_ANON_KEY = "regional-anon-key";
  process.env.NORTH_SAN_MATEO_SUPABASE_SERVICE_ROLE_KEY = "regional-service-key";

  try {
    for (const slug of ["foster-city", "san-mateo-city", "san-mateo-county"] as const) {
      const jurisdiction = getJurisdictionBySlug(slug);
      assert.equal(jurisdiction?.slug, slug);
      assert.equal(jurisdiction?.regionSlug, "north-san-mateo");
      assert.equal(jurisdiction?.supabaseUrl, "https://north-san-mateo.example.test");
    }
  } finally {
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_URL = previous.url;
    if (previous.anonKey === undefined) {
      delete process.env.NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_ANON_KEY = previous.anonKey;
    }
    if (previous.serviceRoleKey === undefined) {
      delete process.env.NORTH_SAN_MATEO_SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.NORTH_SAN_MATEO_SUPABASE_SERVICE_ROLE_KEY = previous.serviceRoleKey;
    }
  }
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
