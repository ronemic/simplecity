import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseEnv, getRequiredPublicSupabaseEnv } from "./env";
export { createServiceSupabaseClient, maybeCreateServiceSupabaseClient } from "./service";

export async function createServerSupabaseClient() {
  const { url, anonKey } = getRequiredPublicSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies. Route handlers and actions can.
        }
      }
    }
  });
}

export async function maybeCreateServerSupabaseClient() {
  const env = getPublicSupabaseEnv();
  if (!env.url || !env.anonKey) return null;
  return createServerSupabaseClient();
}
