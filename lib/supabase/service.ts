import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv, getRequiredPublicSupabaseEnv, getServiceRoleKey } from "./env";
import type { JurisdictionSlug } from "@/lib/config/jurisdictions";

export function createServiceSupabaseClient(slug?: JurisdictionSlug) {
  const { url } = getRequiredPublicSupabaseEnv(slug);
  const serviceRoleKey = getServiceRoleKey(slug);

  if (!serviceRoleKey) {
    if (slug === "santa-clara-county") {
      throw new Error(
        "Santa Clara County Supabase configuration is missing. Set NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_URL, NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_ANON_KEY, and SANTA_CLARA_COUNTY_SUPABASE_SERVICE_ROLE_KEY."
      );
    }

    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createSupabaseClient(url, serviceRoleKey, {
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
