import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const ALL_JURISDICTIONS_SLUG = "all" as const;

export type JurisdictionSlug = "foster-city" | "san-mateo-city";
export type JurisdictionSelection = JurisdictionSlug | typeof ALL_JURISDICTIONS_SLUG;
export type CivicPlatform = "primegov";

export type JurisdictionConfig = {
  name: string;
  slug: JurisdictionSlug;
  platform: CivicPlatform;
  primegovUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
};

export type JurisdictionPublicOption = {
  name: string;
  slug: JurisdictionSelection;
};

const DEFAULT_FOSTER_CITY_PRIMEGOV_URL = "https://fostercity.primegov.com/public/portal";
const DEFAULT_SAN_MATEO_CITY_PRIMEGOV_URL = "https://sanmateo.primegov.com/public/portal";

const publicClients = new Map<JurisdictionSlug, SupabaseClient>();
const serviceClients = new Map<JurisdictionSlug, SupabaseClient>();

export const KNOWN_JURISDICTION_SLUGS: JurisdictionSlug[] = [
  "foster-city",
  "san-mateo-city"
];

export function getJurisdictions(): JurisdictionConfig[] {
  return [
    {
      name: "Foster City",
      slug: "foster-city",
      platform: "primegov",
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
      slug: "san-mateo-city",
      platform: "primegov",
      primegovUrl:
        process.env.SAN_MATEO_CITY_PRIMEGOV_URL || DEFAULT_SAN_MATEO_CITY_PRIMEGOV_URL,
      supabaseUrl: process.env.NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_ANON_KEY,
      supabaseServiceRoleKey: process.env.SAN_MATEO_CITY_SUPABASE_SERVICE_ROLE_KEY
    }
  ];
}

export function getPublicJurisdictionOptions(): JurisdictionPublicOption[] {
  return [
    { name: "All", slug: ALL_JURISDICTIONS_SLUG },
    ...getJurisdictions().map((jurisdiction) => ({
      name: jurisdiction.name,
      slug: jurisdiction.slug
    }))
  ];
}

export function getDefaultJurisdiction() {
  const jurisdiction = getJurisdictionBySlug("foster-city");
  if (!jurisdiction) throw new Error("Default jurisdiction foster-city is not configured.");
  return jurisdiction;
}

export function getJurisdictionBySlug(slug: string | null | undefined) {
  return getJurisdictions().find((jurisdiction) => jurisdiction.slug === slug) || null;
}

export function requireValidJurisdictionSlug(
  slug: string | null | undefined
): JurisdictionSelection {
  if (slug === ALL_JURISDICTIONS_SLUG) return ALL_JURISDICTIONS_SLUG;
  if (slug === "foster-city" || slug === "san-mateo-city") return slug;
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
  if (slug === ALL_JURISDICTIONS_SLUG) return "All cities";
  return getJurisdictionBySlug(slug)?.name || "Foster City";
}

export function getJurisdictionSlugFromRow(
  value: string | null | undefined
): JurisdictionSlug {
  return value === "san-mateo-city" ? "san-mateo-city" : "foster-city";
}

function missingConfigMessage(jurisdiction: JurisdictionConfig, scope: "public" | "service") {
  if (jurisdiction.slug === "san-mateo-city") {
    if (scope === "service") {
      return "San Mateo City Supabase configuration is missing. Set NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_URL, NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_ANON_KEY, and SAN_MATEO_CITY_SUPABASE_SERVICE_ROLE_KEY.";
    }

    return "San Mateo City public Supabase configuration is missing. Set NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_URL and NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_ANON_KEY.";
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
  const publicConfig = requirePublicConfig(jurisdiction);
  if (!jurisdiction.supabaseServiceRoleKey) {
    throw new Error(missingConfigMessage(jurisdiction, "service"));
  }

  return {
    ...publicConfig,
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
  return getJurisdictions().map((jurisdiction) => ({
    jurisdiction,
    supabase: getPublicSupabaseClientForJurisdiction(jurisdiction.slug)
  }));
}

export function getAllServiceSupabaseClients() {
  return getJurisdictions().map((jurisdiction) => ({
    jurisdiction,
    supabase: getServiceSupabaseClientForJurisdiction(jurisdiction.slug)
  }));
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
