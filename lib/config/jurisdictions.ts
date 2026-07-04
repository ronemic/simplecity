import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const ALL_JURISDICTIONS_SLUG = "all" as const;
export const JURISDICTION_PREFERENCE_COOKIE = "simplecity.jurisdiction";

export type JurisdictionSlug =
  | "foster-city"
  | "san-mateo-city"
  | "san-mateo-county"
  | "santa-clara-county"
  | "mountain-view"
  | "san-francisco"
  | "menlo-park";
export type PublicJurisdictionSlug =
  | "foster-city"
  | "san-mateo"
  | "san-mateo-county"
  | "santa-clara-county"
  | "mountain-view"
  | "san-francisco"
  | "menlo-park";
export type JurisdictionSelection = JurisdictionSlug | typeof ALL_JURISDICTIONS_SLUG;
export type PublicJurisdictionSelection =
  | PublicJurisdictionSlug
  | typeof ALL_JURISDICTIONS_SLUG;
export type CivicPlatform = "primegov" | "iqm2" | "legistar" | "official-site";

export type JurisdictionConfig = {
  name: string;
  officialName: string;
  slug: JurisdictionSlug;
  platform: CivicPlatform;
  timezone: string;
  sourceUrl: string;
  primegovUrl?: string;
  iqm2Url?: string;
  legistarUrl?: string;
  officialSiteUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
};

export type JurisdictionPublicOption = {
  name: string;
  slug: PublicJurisdictionSelection;
};

const DEFAULT_FOSTER_CITY_PRIMEGOV_URL = "https://fostercity.primegov.com/public/portal";
const DEFAULT_SAN_MATEO_CITY_PRIMEGOV_URL = "https://sanmateo.primegov.com/public/portal";
const DEFAULT_SAN_MATEO_COUNTY_LEGISTAR_URL =
  process.env.SAN_MATEO_COUNTY_LEGISTAR_URL ||
  "https://sanmateocounty.legistar.com/Calendar.aspx";
const DEFAULT_SANTA_CLARA_COUNTY_IQM2_URL =
  "https://sccgov.iqm2.com/Citizens/Default.aspx?frame=no";
const DEFAULT_MOUNTAIN_VIEW_LEGISTAR_URL =
  process.env.MOUNTAIN_VIEW_LEGISTAR_URL ||
  "https://mountainview.legistar.com/Calendar.aspx";
const DEFAULT_SAN_FRANCISCO_LEGISTAR_URL =
  process.env.SAN_FRANCISCO_LEGISTAR_URL ||
  "https://sfgov.legistar.com/Calendar.aspx";
const DEFAULT_MENLO_PARK_AGENDAS_URL =
  process.env.MENLO_PARK_AGENDAS_URL ||
  "https://www.menlopark.gov/Agendas-and-minutes";
export const SAN_FRANCISCO_MISSING_SUPABASE_CONFIG_MESSAGE = [
  "San Francisco Supabase configuration is missing. Set",
  "NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_URL,",
  "NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_ANON_KEY, and",
  "SAN_FRANCISCO_SUPABASE_SERVICE_ROLE_KEY."
].join("\n");
export const MENLO_PARK_MISSING_SUPABASE_CONFIG_MESSAGE = [
  "Menlo Park Supabase configuration is missing. Set",
  "NEXT_PUBLIC_MENLO_PARK_SUPABASE_URL,",
  "NEXT_PUBLIC_MENLO_PARK_SUPABASE_ANON_KEY, and",
  "MENLO_PARK_SUPABASE_SERVICE_ROLE_KEY."
].join("\n");

const publicClients = new Map<JurisdictionSlug, SupabaseClient>();
const serviceClients = new Map<JurisdictionSlug, SupabaseClient>();

export const KNOWN_JURISDICTION_SLUGS: JurisdictionSlug[] = [
  "foster-city",
  "san-mateo-city",
  "san-mateo-county",
  "mountain-view",
  "santa-clara-county",
  "san-francisco",
  "menlo-park"
];

export const PUBLIC_JURISDICTION_OPTIONS: JurisdictionPublicOption[] = [
  { name: "All", slug: ALL_JURISDICTIONS_SLUG },
  { name: "Foster City", slug: "foster-city" },
  { name: "San Mateo", slug: "san-mateo" },
  { name: "San Mateo County", slug: "san-mateo-county" },
  { name: "Mountain View", slug: "mountain-view" },
  { name: "Santa Clara County", slug: "santa-clara-county" },
  { name: "San Francisco", slug: "san-francisco" },
  { name: "Menlo Park", slug: "menlo-park" }
];

export function toInternalJurisdictionSlug(
  slug: string | null | undefined
): string | null | undefined {
  if (slug === "san-mateo") return "san-mateo-city";
  return slug;
}

export function toPublicJurisdictionSlug(
  slug: JurisdictionSelection
): PublicJurisdictionSelection {
  if (slug === "san-mateo-city") return "san-mateo";
  return slug;
}

export function getJurisdictionDisplayLabel(slug: string | null | undefined) {
  if (slug === ALL_JURISDICTIONS_SLUG || slug === "all") return "All";
  const internalSlug = toInternalJurisdictionSlug(slug);
  if (internalSlug === "san-mateo-city") return "San Mateo";
  if (internalSlug === "san-mateo-county") return "San Mateo County";
  if (internalSlug === "santa-clara-county") return "Santa Clara County";
  if (internalSlug === "mountain-view") return "Mountain View";
  if (internalSlug === "san-francisco") return "San Francisco";
  if (internalSlug === "menlo-park") return "Menlo Park";
  return getJurisdictionBySlug(internalSlug)?.name || "Foster City";
}

export function getJurisdictions(): JurisdictionConfig[] {
  return [
    {
      name: "Foster City",
      officialName: "City of Foster City",
      slug: "foster-city",
      platform: "primegov",
      timezone: "America/Los_Angeles",
      sourceUrl:
        process.env.FOSTER_CITY_PRIMEGOV_URL ||
        process.env.SCRAPER_BASE_URL ||
        DEFAULT_FOSTER_CITY_PRIMEGOV_URL,
      primegovUrl:
        process.env.FOSTER_CITY_PRIMEGOV_URL ||
        process.env.SCRAPER_BASE_URL ||
        DEFAULT_FOSTER_CITY_PRIMEGOV_URL,
      supabaseUrl:
        process.env.NEXT_PUBLIC_FOSTER_CITY_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey:
        process.env.NEXT_PUBLIC_FOSTER_CITY_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseServiceRoleKey:
        process.env.FOSTER_CITY_SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY
    },
    {
      name: "San Mateo",
      officialName: "City of San Mateo",
      slug: "san-mateo-city",
      platform: "primegov",
      timezone: "America/Los_Angeles",
      sourceUrl:
        process.env.SAN_MATEO_CITY_PRIMEGOV_URL || DEFAULT_SAN_MATEO_CITY_PRIMEGOV_URL,
      primegovUrl:
        process.env.SAN_MATEO_CITY_PRIMEGOV_URL || DEFAULT_SAN_MATEO_CITY_PRIMEGOV_URL,
      supabaseUrl: process.env.NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_ANON_KEY,
      supabaseServiceRoleKey: process.env.SAN_MATEO_CITY_SUPABASE_SERVICE_ROLE_KEY
    },
    {
      name: "San Mateo County",
      officialName: "County of San Mateo",
      slug: "san-mateo-county",
      platform: "legistar",
      timezone: "America/Los_Angeles",
      sourceUrl: DEFAULT_SAN_MATEO_COUNTY_LEGISTAR_URL,
      legistarUrl: DEFAULT_SAN_MATEO_COUNTY_LEGISTAR_URL,
      supabaseUrl: process.env.NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_ANON_KEY,
      supabaseServiceRoleKey: process.env.SAN_MATEO_COUNTY_SUPABASE_SERVICE_ROLE_KEY
    },
    {
      name: "Mountain View",
      officialName: "City of Mountain View",
      slug: "mountain-view",
      platform: "legistar",
      timezone: "America/Los_Angeles",
      sourceUrl: DEFAULT_MOUNTAIN_VIEW_LEGISTAR_URL,
      legistarUrl: DEFAULT_MOUNTAIN_VIEW_LEGISTAR_URL,
      supabaseUrl: process.env.NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_ANON_KEY,
      supabaseServiceRoleKey: process.env.MOUNTAIN_VIEW_SUPABASE_SERVICE_ROLE_KEY
    },
    {
      name: "Santa Clara County",
      officialName: "County of Santa Clara",
      slug: "santa-clara-county",
      platform: "iqm2",
      timezone: "America/Los_Angeles",
      sourceUrl:
        process.env.SANTA_CLARA_COUNTY_IQM2_URL || DEFAULT_SANTA_CLARA_COUNTY_IQM2_URL,
      iqm2Url:
        process.env.SANTA_CLARA_COUNTY_IQM2_URL || DEFAULT_SANTA_CLARA_COUNTY_IQM2_URL,
      supabaseUrl: process.env.NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_ANON_KEY,
      supabaseServiceRoleKey: process.env.SANTA_CLARA_COUNTY_SUPABASE_SERVICE_ROLE_KEY
    },
    {
      name: "San Francisco",
      officialName: "City and County of San Francisco",
      slug: "san-francisco",
      platform: "legistar",
      timezone: "America/Los_Angeles",
      sourceUrl: DEFAULT_SAN_FRANCISCO_LEGISTAR_URL,
      legistarUrl: DEFAULT_SAN_FRANCISCO_LEGISTAR_URL,
      supabaseUrl: process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_ANON_KEY,
      supabaseServiceRoleKey: process.env.SAN_FRANCISCO_SUPABASE_SERVICE_ROLE_KEY
    },
    {
      name: "Menlo Park",
      officialName: "City of Menlo Park",
      slug: "menlo-park",
      platform: "official-site",
      timezone: "America/Los_Angeles",
      sourceUrl: DEFAULT_MENLO_PARK_AGENDAS_URL,
      officialSiteUrl: DEFAULT_MENLO_PARK_AGENDAS_URL,
      supabaseUrl: process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_ANON_KEY,
      supabaseServiceRoleKey: process.env.MENLO_PARK_SUPABASE_SERVICE_ROLE_KEY
    }
  ];
}

export function getPublicJurisdictionOptions(): JurisdictionPublicOption[] {
  return PUBLIC_JURISDICTION_OPTIONS;
}

export function getDefaultJurisdiction() {
  const jurisdiction = getJurisdictionBySlug("san-mateo-city");
  if (!jurisdiction) throw new Error("Default jurisdiction san-mateo-city is not configured.");
  return jurisdiction;
}

export function getJurisdictionBySlug(slug: string | null | undefined) {
  const internalSlug = toInternalJurisdictionSlug(slug);
  return getJurisdictions().find((jurisdiction) => jurisdiction.slug === internalSlug) || null;
}

export function requireValidJurisdictionSlug(
  slug: string | null | undefined
): JurisdictionSelection {
  slug = toInternalJurisdictionSlug(slug);
  if (slug === ALL_JURISDICTIONS_SLUG) return ALL_JURISDICTIONS_SLUG;
  if (
    slug === "foster-city" ||
    slug === "san-mateo-city" ||
    slug === "san-mateo-county" ||
    slug === "santa-clara-county" ||
    slug === "mountain-view" ||
    slug === "san-francisco" ||
    slug === "menlo-park"
  ) {
    return slug;
  }
  throw new Error(`Invalid jurisdiction slug: ${String(slug || "")}`);
}

export function normalizeJurisdictionSelection(
  slug: string | null | undefined
): JurisdictionSelection {
  try {
    return requireValidJurisdictionSlug(slug || getDefaultJurisdiction().slug);
  } catch {
    return getDefaultJurisdiction().slug;
  }
}

export function getJurisdictionLabel(slug: JurisdictionSelection) {
  if (slug === ALL_JURISDICTIONS_SLUG) return "All";
  return getJurisdictionBySlug(slug)?.name || "Foster City";
}

export function getJurisdictionSlugFromRow(
  value: string | null | undefined
): JurisdictionSlug {
  return KNOWN_JURISDICTION_SLUGS.includes(value as JurisdictionSlug)
    ? (value as JurisdictionSlug)
    : "foster-city";
}

function missingConfigMessage(jurisdiction: JurisdictionConfig, scope: "public" | "service") {
  if (jurisdiction.slug === "san-mateo-county") {
    if (scope === "service") {
      return "San Mateo County Supabase configuration is missing. Set NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_URL, NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_ANON_KEY, and SAN_MATEO_COUNTY_SUPABASE_SERVICE_ROLE_KEY.";
    }

    return "San Mateo County public Supabase configuration is missing. Set NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_URL and NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_ANON_KEY.";
  }

  if (jurisdiction.slug === "santa-clara-county") {
    return "Santa Clara County Supabase configuration is missing. Set NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_URL, NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_ANON_KEY, and SANTA_CLARA_COUNTY_SUPABASE_SERVICE_ROLE_KEY.";
  }

  if (jurisdiction.slug === "mountain-view") {
    return scope === "service"
      ? "Mountain View Supabase configuration is missing. Set NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_URL, NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_ANON_KEY, and MOUNTAIN_VIEW_SUPABASE_SERVICE_ROLE_KEY."
      : "Mountain View public Supabase configuration is missing. Set NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_URL and NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_ANON_KEY.";
  }

  if (jurisdiction.slug === "san-francisco") {
    return SAN_FRANCISCO_MISSING_SUPABASE_CONFIG_MESSAGE;
  }

  if (jurisdiction.slug === "menlo-park") {
    return MENLO_PARK_MISSING_SUPABASE_CONFIG_MESSAGE;
  }

  if (jurisdiction.slug === "san-mateo-city") {
    if (scope === "service") {
      return "San Mateo Supabase configuration is missing. Set NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_URL, NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_ANON_KEY, and SAN_MATEO_CITY_SUPABASE_SERVICE_ROLE_KEY.";
    }

    return "San Mateo public Supabase configuration is missing. Set NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_URL and NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_ANON_KEY.";
  }

  if (scope === "service") {
    return "Foster City Supabase configuration is missing. Set NEXT_PUBLIC_FOSTER_CITY_SUPABASE_URL, NEXT_PUBLIC_FOSTER_CITY_SUPABASE_ANON_KEY, and FOSTER_CITY_SUPABASE_SERVICE_ROLE_KEY, or keep the default NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.";
  }

  return "Foster City public Supabase configuration is missing. Set NEXT_PUBLIC_FOSTER_CITY_SUPABASE_URL and NEXT_PUBLIC_FOSTER_CITY_SUPABASE_ANON_KEY, or keep the default NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";
}

function requireJurisdiction(slug: string | null | undefined): JurisdictionConfig {
  const validSlug = requireValidJurisdictionSlug(slug);
  if (validSlug === ALL_JURISDICTIONS_SLUG) {
    throw new Error("A concrete jurisdiction slug is required.");
  }

  const jurisdiction = getJurisdictionBySlug(validSlug);
  if (!jurisdiction) throw new Error(`Unknown jurisdiction slug: ${validSlug}`);
  return jurisdiction;
}

function requirePublicConfig(jurisdiction: JurisdictionConfig) {
  if (!jurisdiction.supabaseUrl || !jurisdiction.supabaseAnonKey) {
    throw new Error(missingConfigMessage(jurisdiction, "public"));
  }

  return {
    url: jurisdiction.supabaseUrl,
    anonKey: jurisdiction.supabaseAnonKey
  };
}

function requireServiceConfig(jurisdiction: JurisdictionConfig) {
  if (
    !jurisdiction.supabaseUrl ||
    !jurisdiction.supabaseAnonKey ||
    !jurisdiction.supabaseServiceRoleKey
  ) {
    throw new Error(missingConfigMessage(jurisdiction, "service"));
  }

  return {
    url: jurisdiction.supabaseUrl,
    anonKey: jurisdiction.supabaseAnonKey,
    serviceRoleKey: jurisdiction.supabaseServiceRoleKey
  };
}

function createSupabaseClient(url: string, key: string) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

export function getPublicSupabaseClientForJurisdiction(slug: string | null | undefined) {
  const jurisdiction = requireJurisdiction(slug);
  const existing = publicClients.get(jurisdiction.slug);
  if (existing) return existing;

  const { url, anonKey } = requirePublicConfig(jurisdiction);
  const client = createSupabaseClient(url, anonKey);
  publicClients.set(jurisdiction.slug, client);
  return client;
}

export function getServiceSupabaseClientForJurisdiction(slug: string | null | undefined) {
  const jurisdiction = requireJurisdiction(slug);
  const existing = serviceClients.get(jurisdiction.slug);
  if (existing) return existing;

  const { url, serviceRoleKey } = requireServiceConfig(jurisdiction);
  const client = createSupabaseClient(url, serviceRoleKey);
  serviceClients.set(jurisdiction.slug, client);
  return client;
}

export function getAllPublicSupabaseClients() {
  return getJurisdictions().flatMap((jurisdiction) => {
    try {
      return [
        {
          jurisdiction,
          supabase: getPublicSupabaseClientForJurisdiction(jurisdiction.slug)
        }
      ];
    } catch {
      return [];
    }
  });
}

export function getAllServiceSupabaseClients() {
  return getJurisdictions().flatMap((jurisdiction) => {
    try {
      return [
        {
          jurisdiction,
          supabase: getServiceSupabaseClientForJurisdiction(jurisdiction.slug)
        }
      ];
    } catch {
      return [];
    }
  });
}

export function getPublicSupabaseClientsForSelection(selection: JurisdictionSelection) {
  if (selection === ALL_JURISDICTIONS_SLUG) return getAllPublicSupabaseClients();
  const jurisdiction = requireJurisdiction(selection);
  return [
    {
      jurisdiction,
      supabase: getPublicSupabaseClientForJurisdiction(jurisdiction.slug)
    }
  ];
}

export function getServiceSupabaseClientsForSelection(selection: JurisdictionSelection) {
  if (selection === ALL_JURISDICTIONS_SLUG) return getAllServiceSupabaseClients();
  const jurisdiction = requireJurisdiction(selection);
  return [
    {
      jurisdiction,
      supabase: getServiceSupabaseClientForJurisdiction(jurisdiction.slug)
    }
  ];
}
