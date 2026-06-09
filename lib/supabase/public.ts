import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv, getRequiredPublicSupabaseEnv } from "./env";

let publicClient: SupabaseClient | null = null;

function createAnonClient(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

export function createPublicSupabaseClient() {
  const { url, anonKey } = getRequiredPublicSupabaseEnv();
  return createAnonClient(url, anonKey);
}

export function maybeCreatePublicSupabaseClient() {
  const env = getPublicSupabaseEnv();
  if (!env.url || !env.anonKey) return null;

  publicClient ||= createAnonClient(env.url, env.anonKey);
  return publicClient;
}
