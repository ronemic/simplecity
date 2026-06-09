import { revalidatePath } from "next/cache";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminNav } from "@/components/AdminNav";
import { getAdminCollections } from "@/lib/db/queries";
import { writeAuditLog } from "@/lib/db/upsertMeetings";
import { getAuthenticatedAdmin, requireAdmin } from "@/lib/supabase/admin";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function normalizeAnnouncement(formData: FormData) {
  return {
    title: String(formData.get("title") || ""),
    body: String(formData.get("body") || ""),
    type: String(formData.get("type") || "info"),
    starts_at: String(formData.get("starts_at") || "") || null,
    ends_at: String(formData.get("ends_at") || "") || null,
    is_published: formData.get("is_published") === "on"
  };
}

async function createAnnouncementAction(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const supabase = createServiceSupabaseClient();
  const row = normalizeAnnouncement(formData);
  const { data, error } = await supabase.from("announcements").insert(row).select("id").single();
  if (error) throw new Error(error.message);

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "create",
    entityType: "announcement",
    entityId: data.id,
    after: row
  });

  revalidatePath("/admin/announcements");
  revalidatePath("/");
}

async function updateAnnouncementAction(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const supabase = createServiceSupabaseClient();
  const id = String(formData.get("id"));
  const row = normalizeAnnouncement(formData);
  const { data: before } = await supabase.from("announcements").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("announcements").update(row).eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "update",
    entityType: "announcement",
    entityId: id,
    before,
    after: row
  });

  revalidatePath("/admin/announcements");
  revalidatePath("/");
}

async function deleteAnnouncementAction(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const supabase = createServiceSupabaseClient();
  const id = String(formData.get("id"));
  const { data: before } = await supabase.from("announcements").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "delete",
    entityType: "announcement",
    entityId: id,
    before
  });

  revalidatePath("/admin/announcements");
  revalidatePath("/");
}

function AnnouncementForm({
  announcement,
  action
}: {
  announcement?: Record<string, unknown>;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="quiet-card space-y-4 p-5 sm:p-6">
      {announcement?.id ? <input type="hidden" name="id" value={String(announcement.id)} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-bold uppercase text-black/70">Title</span>
          <input
            name="title"
            required
            defaultValue={String(announcement?.title || "")}
            className="input-control"
          />
        </label>
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-bold uppercase text-black/70">Body</span>
          <textarea
            name="body"
            required
            rows={3}
            defaultValue={String(announcement?.body || "")}
            className="input-control input-control--textarea"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-black/70">Type</span>
          <select
            name="type"
            defaultValue={String(announcement?.type || "info")}
            className="input-control"
          >
            <option value="info">Info</option>
            <option value="alert">Alert</option>
            <option value="event">Event</option>
          </select>
        </label>
        <label className="flex items-end gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-3 text-sm font-semibold">
          <input type="checkbox" name="is_published" defaultChecked={Boolean(announcement?.is_published ?? true)} />
          Published
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-black/70">Starts at</span>
          <input
            type="datetime-local"
            name="starts_at"
            className="input-control"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-black/70">Ends at</span>
          <input
            type="datetime-local"
            name="ends_at"
            className="input-control"
          />
        </label>
      </div>
      <button className="action-primary">
        {announcement?.id ? "Save announcement" : "Create announcement"}
      </button>
    </form>
  );
}

export default async function AdminAnnouncementsPage() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return (
      <div className="section-shell py-10">
        <AdminLoginForm />
      </div>
    );
  }

  const { announcements } = await getAdminCollections();

  return (
    <div className="section-shell py-10">
      <div className="mb-6">
        <p className="label-eyebrow text-civic">Admin</p>
        <h1 className="page-title mt-2">Announcements</h1>
      </div>
      <AdminNav />

      <section className="mt-8">
        <h2 className="mb-3 text-2xl font-bold text-ink">Create announcement</h2>
        <AnnouncementForm action={createAnnouncementAction} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-2xl font-bold text-ink">Existing announcements</h2>
        <div className="grid gap-4">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="space-y-3">
              <AnnouncementForm announcement={announcement as unknown as Record<string, unknown>} action={updateAnnouncementAction} />
              <form action={deleteAnnouncementAction}>
                <input type="hidden" name="id" value={announcement.id} />
                <button className="action-secondary border-clay/20 bg-clay/10 px-4 text-clay hover:bg-clay/20">
                  Delete announcement
                </button>
              </form>
            </div>
          ))}
          {announcements.length === 0 ? (
            <div className="quiet-card p-8 text-center">
              <h3 className="text-lg font-semibold text-ink">No announcements yet</h3>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
