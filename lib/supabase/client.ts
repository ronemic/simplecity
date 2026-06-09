"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getRequiredPublicSupabaseEnv } from "./env";

export function createClient() {
  const { url, anonKey } = getRequiredPublicSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
