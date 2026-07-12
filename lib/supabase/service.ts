import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv, getServiceRoleKey } from "./env";
import {
  MENLO_PARK_MISSING_SUPABASE_CONFIG_MESSAGE,
  SAN_FRANCISCO_MISSING_SUPABASE_CONFIG_MESSAGE,
  SANTA_CLARA_REGION_MISSING_SUPABASE_CONFIG_MESSAGE,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";

export function createServiceSupabaseClient(slug?: JurisdictionSlug) {
  const env = getPublicSupabaseEnv(slug);
  const serviceRoleKey = getServiceRoleKey(slug);

  if (!env.url || !env.anonKey || !serviceRoleKey) {
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

    if (slug === "los-altos") {
      throw new Error(SANTA_CLARA_REGION_MISSING_SUPABASE_CONFIG_MESSAGE);
    }

    if (slug === "san-francisco") {
      throw new Error(SAN_FRANCISCO_MISSING_SUPABASE_CONFIG_MESSAGE);
    }

    if (slug === "menlo-park") {
      throw new Error(MENLO_PARK_MISSING_SUPABASE_CONFIG_MESSAGE);
    }

    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createSupabaseClient(env.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function maybeCreateServiceSupabaseClient(slug?: JurisdictionSlug) {
  const env = getPublicSupabaseEnv(slug);
  const serviceRoleKey = getServiceRoleKey(slug);
  if (!env.url || !env.anonKey || !serviceRoleKey) return null;
  return createServiceSupabaseClient(slug);
}
