import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv, getRequiredPublicSupabaseEnv, getServiceRoleKey } from "./env";
import type { JurisdictionSlug } from "@/lib/config/jurisdictions";

export function createServiceSupabaseClient(slug?: JurisdictionSlug) {
  const { url } = getRequiredPublicSupabaseEnv(slug);
  const serviceRoleKey = getServiceRoleKey(slug);

  if (!serviceRoleKey) {
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
