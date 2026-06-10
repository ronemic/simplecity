import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv, getRequiredPublicSupabaseEnv } from "./env";
import type { JurisdictionSlug } from "@/lib/config/jurisdictions";

const publicClients = new Map<JurisdictionSlug | "default", SupabaseClient>();

function createAnonClient(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

export function createPublicSupabaseClient(slug?: JurisdictionSlug) {
  const { url, anonKey } = getRequiredPublicSupabaseEnv(slug);
  return createAnonClient(url, anonKey);
}

export function maybeCreatePublicSupabaseClient(slug?: JurisdictionSlug) {
  const env = getPublicSupabaseEnv(slug);
  if (!env.url || !env.anonKey) return null;

  const key = slug || "default";
  const existing = publicClients.get(key);
  if (existing) return existing;

  const client = createAnonClient(env.url, env.anonKey);
  publicClients.set(key, client);
  return client;
}
