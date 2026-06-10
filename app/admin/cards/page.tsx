import { AdminJurisdictionFilter } from "@/components/AdminJurisdictionFilter";
import { AdminCardEditor } from "@/components/AdminCardEditor";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminNav } from "@/components/AdminNav";
import { getAdminCollections } from "@/lib/db/queries";
import { normalizeJurisdictionSelection } from "@/lib/config/jurisdictions";
import { getAuthenticatedAdmin } from "@/lib/supabase/admin";

export default async function AdminCardsPage({
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
  const { cards } = await getAdminCollections(jurisdiction);

  return (
    <div className="section-shell py-10">
      <div className="mb-6">
        <p className="text-sm font-bold uppercase text-civic">Admin</p>
        <h1 className="mt-2 text-4xl font-black text-ink">Cards</h1>
      </div>
      <AdminNav jurisdiction={jurisdiction} />
      <AdminJurisdictionFilter selected={jurisdiction} />

      <div className="mt-8 grid gap-4">
        {cards.length > 0 ? (
          cards.map((card) => <AdminCardEditor key={card.id} card={card} />)
        ) : (
          <div className="quiet-card p-8 text-center">
            <h2 className="text-lg font-semibold text-ink">No cards generated yet</h2>
            <p className="mt-2 text-sm text-black/70">Run the scraper after configuring OpenRouter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
