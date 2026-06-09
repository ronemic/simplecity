import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminNav } from "@/components/AdminNav";
import { ScraperRunStatus } from "@/components/ScraperRunStatus";
import { getAdminCollections } from "@/lib/db/queries";
import { getAuthenticatedAdmin } from "@/lib/supabase/admin";
import { hasPublicSupabaseEnv } from "@/lib/supabase/env";

function Stat({
  label,
  value,
  detail
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="quiet-card p-5">
      <p className="label-eyebrow">{label}</p>
      <p className="mt-2 text-3xl font-black text-ink">{value}</p>
      {detail ? <p className="mt-1 text-sm text-black/55">{detail}</p> : null}
    </div>
  );
}

export default async function AdminPage() {
  const hasEnv = hasPublicSupabaseEnv();
  const admin = await getAuthenticatedAdmin();

  if (!hasEnv) {
    return (
      <div className="section-shell py-10">
        <div className="quiet-card mx-auto max-w-xl p-6 sm:p-8">
          <p className="label-eyebrow text-civic">Admin</p>
          <h1 className="mt-2 text-3xl font-black text-ink">Supabase is not configured</h1>
          <p className="mt-2 text-sm leading-6 text-black/65">
            Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`, then
            restart the dev server to use the admin portal.
          </p>
        </div>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="section-shell py-10">
        <AdminLoginForm />
      </div>
    );
  }

  const collections = await getAdminCollections();
  const upcoming = collections.meetings.filter((meeting) => meeting.status === "Upcoming").length;
  const publishedCards = collections.cards.filter((card) => card.is_published).length;
  const failedDocuments = collections.documents.filter((doc) => doc.download_error).length;
  const failedRuns = collections.scraperRuns.filter((run) => run.status === "failed" || run.error).length;
  const lastRun = collections.scraperRuns[0];

  return (
    <div className="section-shell py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-civic">Admin</p>
          <h1 className="mt-2 text-4xl font-black text-ink">SimpleCity dashboard</h1>
          <p className="mt-2 text-sm text-black/60">Signed in as {admin.email}</p>
        </div>
      </div>

      <AdminNav />

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total meetings" value={collections.meetings.length} />
        <Stat label="Upcoming meetings" value={upcoming} />
        <Stat label="Published cards" value={publishedCards} />
        <Stat label="Failed documents" value={failedDocuments} />
        <Stat label="Failed LLM summaries" value={failedRuns} />
        <Stat
          label="Last scraper run"
          value={String(lastRun?.status || "None")}
          detail={lastRun?.started_at ? new Date(String(lastRun.started_at)).toLocaleString() : undefined}
        />
      </div>

      <div className="mt-8">
        <ScraperRunStatus />
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold text-ink">Recent audit log</h2>
        <div className="divide-y divide-black/10 overflow-hidden rounded-3xl border border-black/10 bg-white shadow-soft">
          {collections.auditLog.length > 0 ? (
            collections.auditLog.slice(0, 8).map((entry) => (
              <div key={String(entry.id)} className="p-5 text-sm">
                <p className="font-semibold text-ink">
                  {String(entry.action)} · {String(entry.entity_type)}
                </p>
                <p className="mt-1 text-black/55">
                  {String(entry.admin_email || "Unknown admin")} ·{" "}
                  {entry.created_at ? new Date(String(entry.created_at)).toLocaleString() : "No date"}
                </p>
              </div>
            ))
          ) : (
            <p className="p-5 text-sm text-black/60">No audit log entries yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
