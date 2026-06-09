import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getAuthenticatedAdminFromCookies } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/db/upsertMeetings";

function listFromCommaText(value: unknown) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function requireAdmin(request: NextRequest) {
  const admin = getAuthenticatedAdminFromCookies(request.cookies);
  if (!admin) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }
  return admin;
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: before } = await supabase.from("summary_cards").select("*").eq("id", id).maybeSingle();

  const update = {
    agenda_item: String(body.agenda_item || ""),
    what_is_happening: String(body.what_is_happening || ""),
    why_it_matters: String(body.why_it_matters || ""),
    who_it_affects: Array.isArray(body.who_it_affects) ? body.who_it_affects.map(String) : listFromCommaText(body.who_it_affects),
    category_tags: Array.isArray(body.category_tags) ? body.category_tags.map(String) : [],
    status: String(body.status || ""),
    comment_window_opens: String(body.comment_window_opens || ""),
    comment_window_closes: String(body.comment_window_closes || ""),
    how_to_act_attend: String(body.how_to_act_attend || ""),
    how_to_act_email: String(body.how_to_act_email || ""),
    how_to_act_submit_comment: String(body.how_to_act_submit_comment || ""),
    source_url: String(body.source_url || ""),
    is_published: Boolean(body.is_published),
    is_featured: Boolean(body.is_featured),
    admin_notes: String(body.admin_notes || "")
  };

  const { error } = await supabase.from("summary_cards").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "update",
    entityType: "summary_card",
    entityId: id,
    before,
    after: update
  });

  revalidatePath("/admin/cards");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: before } = await supabase.from("summary_cards").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("summary_cards").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "delete",
    entityType: "summary_card",
    entityId: id,
    before
  });

  revalidatePath("/admin/cards");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
