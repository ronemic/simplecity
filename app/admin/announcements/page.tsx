import { AdminJurisdictionFilter } from "@/components/AdminJurisdictionFilter";
import { AdminAnnouncementsManager } from "@/components/AdminAnnouncementsManager";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminNav } from "@/components/AdminNav";
import { getAdminCollections } from "@/lib/db/queries";
import { normalizeJurisdictionSelection } from "@/lib/config/jurisdictions";
import { getAuthenticatedAdmin } from "@/lib/supabase/admin";

export default async function AdminAnnouncementsPage({
  searchParams
}: {
  searchParams: Promise<{ jurisdiction?: string }>;
}) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return (
      <div className="section-shell py-10">
        <AdminLoginForm />
      </div>
    );
  }

  const params = await searchParams;
  const jurisdiction = normalizeJurisdictionSelection(params.jurisdiction);
  const { announcements } = await getAdminCollections(jurisdiction);

  return (
    <div className="section-shell py-10">
      <div className="mb-6">
        <p className="label-eyebrow text-civic">Admin</p>
        <h1 className="page-title mt-2">Announcements</h1>
      </div>
      <AdminNav jurisdiction={jurisdiction} />
      <AdminJurisdictionFilter selected={jurisdiction} />

      <div className="mt-8">
        <AdminAnnouncementsManager announcements={announcements} selectedJurisdiction={jurisdiction} />
      </div>
    </div>
  );
}
