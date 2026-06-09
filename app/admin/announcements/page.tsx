import { AdminAnnouncementsManager } from "@/components/AdminAnnouncementsManager";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminNav } from "@/components/AdminNav";
import { getAdminCollections } from "@/lib/db/queries";
import { getAuthenticatedAdmin } from "@/lib/supabase/admin";

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

      <div className="mt-8">
        <AdminAnnouncementsManager announcements={announcements} />
      </div>
    </div>
  );
}
