import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getAuthenticatedAdminFromCookies } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/db/upsertMeetings";
import { revalidatePublicContent } from "@/lib/db/revalidatePublicContent";

function normalizeAnnouncement(body: {
  title?: string;
  body?: string;
  type?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  is_published?: boolean;
}) {
  return {
    title: String(body.title || ""),
    body: String(body.body || ""),
    type: String(body.type || "info"),
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    is_published: Boolean(body.is_published)
  };
}

async function requireAdmin(request: NextRequest) {
  const admin = getAuthenticatedAdminFromCookies(request.cookies);
  if (!admin) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }
  return admin;
}

async function findMatchingAnnouncement(supabase: ReturnType<typeof createServiceSupabaseClient>, row: ReturnType<typeof normalizeAnnouncement>) {
  const query = supabase
    .from("announcements")
    .select("id")
    .eq("title", row.title)
    .eq("body", row.body)
    .eq("type", row.type)
    .eq("is_published", row.is_published);

  const withStarts = row.starts_at ? query.eq("starts_at", row.starts_at) : query.is("starts_at", null);
  const withEnds = row.ends_at ? withStarts.eq("ends_at", row.ends_at) : withStarts.is("ends_at", null);
  const { data, error } = await withEnds.maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => ({}))) as ReturnType<typeof normalizeAnnouncement>;
  const supabase = createServiceSupabaseClient();
  const row = normalizeAnnouncement(body);
  const existingId = await findMatchingAnnouncement(supabase, row);

  if (existingId) {
    revalidatePath("/admin/announcements");
    revalidatePublicContent();
    return NextResponse.json({ ok: true, id: existingId, duplicate: true });
  }

  const { data, error } = await supabase.from("announcements").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "create",
    entityType: "announcement",
    entityId: data.id,
    after: row
  });

  revalidatePath("/admin/announcements");
  revalidatePublicContent();
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => ({}))) as { id?: string } & ReturnType<typeof normalizeAnnouncement>;
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const row = normalizeAnnouncement(body);
  const { data: before } = await supabase.from("announcements").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("announcements").update(row).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "update",
    entityType: "announcement",
    entityId: id,
    before,
    after: row
  });

  revalidatePath("/admin/announcements");
  revalidatePublicContent();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: before } = await supabase.from("announcements").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "delete",
    entityType: "announcement",
    entityId: id,
    before
  });

  revalidatePath("/admin/announcements");
  revalidatePublicContent();
  return NextResponse.json({ ok: true });
}
