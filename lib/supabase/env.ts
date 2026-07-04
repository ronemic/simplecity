import {
  getDefaultJurisdiction,
  getJurisdictionBySlug,
  MENLO_PARK_MISSING_SUPABASE_CONFIG_MESSAGE,
  SAN_FRANCISCO_MISSING_SUPABASE_CONFIG_MESSAGE,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";

export function getPublicSupabaseEnv(slug?: JurisdictionSlug) {
  const jurisdiction = slug ? getJurisdictionBySlug(slug) : getDefaultJurisdiction();

  return {
    url: jurisdiction?.supabaseUrl,
    anonKey: jurisdiction?.supabaseAnonKey
  };
}

export function hasPublicSupabaseEnv(slug?: JurisdictionSlug) {
  const env = getPublicSupabaseEnv(slug);
  return Boolean(env.url && env.anonKey);
}

export function getRequiredPublicSupabaseEnv(slug?: JurisdictionSlug) {
  const env = getPublicSupabaseEnv(slug);
  if (!env.url || !env.anonKey) {
    if (slug === "san-mateo-county") {
      throw new Error(
        "San Mateo County Supabase configuration is missing. Set NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_URL, NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_ANON_KEY, and SAN_MATEO_COUNTY_SUPABASE_SERVICE_ROLE_KEY."
      );
    }

    if (slug === "santa-clara-county") {
      throw new Error(
        "Santa Clara County Supabase configuration is missing. Set NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_URL, NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_ANON_KEY, and SANTA_CLARA_COUNTY_SUPABASE_SERVICE_ROLE_KEY."
      );
    }

    if (slug === "mountain-view") {
      throw new Error(
        "Mountain View Supabase configuration is missing. Set NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_URL, NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_ANON_KEY, and MOUNTAIN_VIEW_SUPABASE_SERVICE_ROLE_KEY."
      );
    }

    if (slug === "san-francisco") {
      throw new Error(SAN_FRANCISCO_MISSING_SUPABASE_CONFIG_MESSAGE);
    }

    if (slug === "menlo-park") {
      throw new Error(MENLO_PARK_MISSING_SUPABASE_CONFIG_MESSAGE);
    }

    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return env as { url: string; anonKey: string };
}

export function getServiceRoleKey(slug?: JurisdictionSlug) {
  const jurisdiction = slug ? getJurisdictionBySlug(slug) : getDefaultJurisdiction();
  return jurisdiction?.supabaseServiceRoleKey;
}
