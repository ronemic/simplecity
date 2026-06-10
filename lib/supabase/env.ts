import {
  getDefaultJurisdiction,
  getJurisdictionBySlug,
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
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return env as { url: string; anonKey: string };
}

export function getServiceRoleKey(slug?: JurisdictionSlug) {
  const jurisdiction = slug ? getJurisdictionBySlug(slug) : getDefaultJurisdiction();
  return jurisdiction?.supabaseServiceRoleKey;
}
