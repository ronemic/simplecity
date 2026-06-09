import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv, getRequiredPublicSupabaseEnv, getServiceRoleKey } from "./env";

export function createServiceSupabaseClient() {
  const { url } = getRequiredPublicSupabaseEnv();
  const serviceRoleKey = getServiceRoleKey();

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

export function maybeCreateServiceSupabaseClient() {
  const env = getPublicSupabaseEnv();
  const serviceRoleKey = getServiceRoleKey();
  if (!env.url || !env.anonKey || !serviceRoleKey) return null;
  return createServiceSupabaseClient();
}
