import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "./server";

export function getConfiguredAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;

  const normalized = email.toLowerCase();
  const configured = getConfiguredAdminEmails();
  if (configured.includes(normalized)) return true;

  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("admins")
      .select("email")
      .ilike("email", normalized)
      .maybeSingle();

    return Boolean(data?.email);
  } catch {
    return false;
  }
}

export async function getAuthenticatedAdmin() {
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;

  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return null;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.email) return null;
  const allowed = await isAdminEmail(user.email);
  if (!allowed) return null;

  return { supabase, user, email: user.email };
}

export async function requireAdmin() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) redirect("/admin");
  return admin;
}

export async function assertAdminForRoute() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return {
      admin: null,
      response: Response.json({ error: "Admin authentication required." }, { status: 401 })
    };
  }

  return { admin, response: null };
}
