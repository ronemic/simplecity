export function getPublicSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
}

export function hasPublicSupabaseEnv() {
  const env = getPublicSupabaseEnv();
  return Boolean(env.url && env.anonKey);
}

export function getRequiredPublicSupabaseEnv() {
  const env = getPublicSupabaseEnv();
  if (!env.url || !env.anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return env as { url: string; anonKey: string };
}

export function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
