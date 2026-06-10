import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedAdminFromCookies } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/db/upsertMeetings";
import { revalidatePublicContent } from "@/lib/db/revalidatePublicContent";
import {
  ALL_JURISDICTIONS_SLUG,
  getDefaultJurisdiction,
  getServiceSupabaseClientForJurisdiction,
  getServiceSupabaseClientsForSelection,
  requireValidJurisdictionSlug,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";

function normalizeAnnouncement(body: {
  title?: string;
  body?: string;
  type?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  is_published?: boolean;
  jurisdiction?: string | null;
  jurisdiction_slug?: string | null;
  target_jurisdiction?: string | null;
}) {
  const rawJurisdiction =
    body.jurisdiction_slug !== undefined
      ? body.jurisdiction_slug
      : body.jurisdiction !== undefined
        ? body.jurisdiction
        : ALL_JURISDICTIONS_SLUG;
  const requestedJurisdiction = String(rawJurisdiction || ALL_JURISDICTIONS_SLUG);
  const jurisdiction = requireValidJurisdictionSlug(requestedJurisdiction);

  return {
    title: String(body.title || ""),
    body: String(body.body || ""),
    type: String(body.type || "info"),
    jurisdiction_slug: jurisdiction === ALL_JURISDICTIONS_SLUG ? null : jurisdiction,
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

async function findMatchingAnnouncement(
  supabase: ReturnType<typeof getServiceSupabaseClientForJurisdiction>,
  row: ReturnType<typeof normalizeAnnouncement>
) {
  const query = supabase
    .from("announcements")
    .select("id")
    .eq("title", row.title)
    .eq("body", row.body)
    .eq("type", row.type)
    .eq("is_published", row.is_published);

  const withJurisdiction = row.jurisdiction_slug
    ? query.eq("jurisdiction_slug", row.jurisdiction_slug)
    : query.is("jurisdiction_slug", null);
  const withStarts = row.starts_at
    ? withJurisdiction.eq("starts_at", row.starts_at)
    : withJurisdiction.is("starts_at", null);
  const withEnds = row.ends_at ? withStarts.eq("ends_at", row.ends_at) : withStarts.is("ends_at", null);
  const { data, error } = await withEnds.maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

function getConcreteJurisdiction(body: {
  jurisdiction?: string | null;
  jurisdiction_slug?: string | null;
  target_jurisdiction?: string | null;
}) {
  const requested = String(
    body.target_jurisdiction ||
      body.jurisdiction ||
      body.jurisdiction_slug ||
      getDefaultJurisdiction().slug
  );
  const slug = requireValidJurisdictionSlug(requested);
  if (slug === ALL_JURISDICTIONS_SLUG) throw new Error("A concrete jurisdiction is required.");
  return slug;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => ({}))) as Parameters<typeof normalizeAnnouncement>[0];
  let row;
  let selection: JurisdictionSelection;
  try {
    row = normalizeAnnouncement(body);
    selection = requireValidJurisdictionSlug(
      String(body.jurisdiction || body.jurisdiction_slug || ALL_JURISDICTIONS_SLUG)
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid jurisdiction." },
      { status: 400 }
    );
  }

  const clients = getServiceSupabaseClientsForSelection(selection);
  const ids: string[] = [];
  let duplicate = false;

  for (const { jurisdiction, supabase } of clients) {
    const insertRow = {
      ...row,
      jurisdiction_slug: selection === ALL_JURISDICTIONS_SLUG ? null : jurisdiction.slug
    };
    const existingId = await findMatchingAnnouncement(supabase, insertRow);

    if (existingId) {
      duplicate = true;
      ids.push(existingId);
      continue;
    }

    const { data, error } = await supabase.from("announcements").insert(insertRow).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ids.push(data.id);

    await writeAuditLog(supabase, {
      adminEmail: admin.email,
      action: "create",
      entityType: "announcement",
      entityId: data.id,
      after: insertRow
    });
  }

  revalidatePath("/admin/announcements");
  revalidatePublicContent();
  return NextResponse.json({ ok: true, ids, duplicate });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => ({}))) as { id?: string } & Parameters<
    typeof normalizeAnnouncement
  >[0];
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  let jurisdiction;
  let row;
  try {
    jurisdiction = getConcreteJurisdiction(body);
    row = normalizeAnnouncement(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid jurisdiction." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClientForJurisdiction(jurisdiction);
  const { data: before, error: beforeError } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (beforeError) return NextResponse.json({ error: beforeError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });

  const { data: updated, error } = await supabase
    .from("announcements")
    .update(row)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });

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

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    jurisdiction?: string | null;
    jurisdiction_slug?: string | null;
    target_jurisdiction?: string | null;
  };
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  let jurisdiction;
  try {
    jurisdiction = getConcreteJurisdiction(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid jurisdiction." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClientForJurisdiction(jurisdiction);
  const { data: before, error: beforeError } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (beforeError) return NextResponse.json({ error: beforeError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });

  const { data: deleted, error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });

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
