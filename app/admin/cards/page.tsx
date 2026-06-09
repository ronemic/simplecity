import { revalidatePath } from "next/cache";
import { AdminCardEditor } from "@/components/AdminCardEditor";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminNav } from "@/components/AdminNav";
import { getAdminCollections } from "@/lib/db/queries";
import { writeAuditLog } from "@/lib/db/upsertMeetings";
import { getAuthenticatedAdmin, requireAdmin } from "@/lib/supabase/admin";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function listFromCommaText(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function updateCardAction(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const supabase = createServiceSupabaseClient();
  const id = String(formData.get("id"));
  const categoryTags = formData.getAll("category_tags").map(String);

  const { data: before } = await supabase.from("summary_cards").select("*").eq("id", id).maybeSingle();

  const update = {
    agenda_item: String(formData.get("agenda_item") || ""),
    what_is_happening: String(formData.get("what_is_happening") || ""),
    why_it_matters: String(formData.get("why_it_matters") || ""),
    who_it_affects: listFromCommaText(formData.get("who_it_affects")),
    category_tags: categoryTags,
    status: String(formData.get("status") || ""),
    comment_window_opens: String(formData.get("comment_window_opens") || ""),
    comment_window_closes: String(formData.get("comment_window_closes") || ""),
    how_to_act_attend: String(formData.get("how_to_act_attend") || ""),
    how_to_act_email: String(formData.get("how_to_act_email") || ""),
    how_to_act_submit_comment: String(formData.get("how_to_act_submit_comment") || ""),
    source_url: String(formData.get("source_url") || ""),
    is_published: formData.get("is_published") === "on",
    is_featured: formData.get("is_featured") === "on",
    admin_notes: String(formData.get("admin_notes") || "")
  };

  const { error } = await supabase.from("summary_cards").update(update).eq("id", id);
  if (error) throw new Error(error.message);

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
}

async function deleteCardAction(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const supabase = createServiceSupabaseClient();
  const id = String(formData.get("id"));
  const { data: before } = await supabase.from("summary_cards").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("summary_cards").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "delete",
    entityType: "summary_card",
    entityId: id,
    before
  });

  revalidatePath("/admin/cards");
  revalidatePath("/");
}

export default async function AdminCardsPage() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return (
      <div className="section-shell py-10">
        <AdminLoginForm />
      </div>
    );
  }

  const { cards } = await getAdminCollections();

  return (
    <div className="section-shell py-10">
      <div className="mb-6">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-civic">Admin</p>
        <h1 className="mt-2 text-4xl font-black text-ink">Cards</h1>
      </div>
      <AdminNav />

      <div className="mt-8 grid gap-4">
        {cards.length > 0 ? (
          cards.map((card) => (
            <AdminCardEditor
              key={card.id}
              card={card}
              updateAction={updateCardAction}
              deleteAction={deleteCardAction}
            />
          ))
        ) : (
          <div className="quiet-card p-8 text-center">
            <h2 className="text-lg font-semibold text-ink">No cards generated yet</h2>
            <p className="mt-2 text-sm text-black/60">Run the scraper after configuring OpenRouter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
