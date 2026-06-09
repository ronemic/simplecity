import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminNav } from "@/components/AdminNav";
import { ScraperRunStatus } from "@/components/ScraperRunStatus";
import { getAdminCollections } from "@/lib/db/queries";
import { getAuthenticatedAdmin } from "@/lib/supabase/admin";

export default async function AdminScraperRunsPage() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return (
      <div className="section-shell py-10">
        <AdminLoginForm />
      </div>
    );
  }

  const { scraperRuns, documents } = await getAdminCollections();
  const failedDocuments = documents.filter((doc) => doc.download_error);

  return (
    <div className="section-shell py-10">
      <div className="mb-6">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-civic">Admin</p>
        <h1 className="mt-2 text-4xl font-black text-ink">Scraper runs</h1>
      </div>
      <AdminNav />

      <div className="mt-8">
        <ScraperRunStatus />
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold text-ink">Recent runs</h2>
        <div className="grid gap-4">
          {scraperRuns.length > 0 ? (
            scraperRuns.map((run) => (
              <article key={String(run.id)} className="quiet-card p-5">
                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                  <div>
                    <h3 className="text-lg font-bold text-ink">{String(run.status || "Unknown")}</h3>
                    <p className="mt-1 text-sm text-black/55">
                      Started {run.started_at ? new Date(String(run.started_at)).toLocaleString() : "No date"}
                      {run.finished_at ? ` · Finished ${new Date(String(run.finished_at)).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <span className="rounded-md bg-black/5 p-2">
                      <strong className="block text-ink">{String(run.meetings_found || 0)}</strong>
                      meetings
                    </span>
                    <span className="rounded-md bg-black/5 p-2">
                      <strong className="block text-ink">{String(run.documents_downloaded || 0)}</strong>
                      documents
                    </span>
                    <span className="rounded-md bg-black/5 p-2">
                      <strong className="block text-ink">{String(run.cards_generated || 0)}</strong>
                      cards
                    </span>
                  </div>
                </div>
                {run.error ? (
                  <p className="mt-4 rounded-md bg-clay/10 p-3 text-sm text-clay">{String(run.error)}</p>
                ) : null}
                <details className="mt-4 rounded-md border border-black/10 bg-black/[0.025] p-3">
                  <summary className="cursor-pointer text-sm font-bold text-ink">Logs</summary>
                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5 text-black/65">
                    {Array.isArray(run.logs)
                      ? run.logs.join("\n")
                      : typeof run.logs === "string"
                        ? run.logs
                        : JSON.stringify(run.logs || [], null, 2)}
                  </pre>
                </details>
              </article>
            ))
          ) : (
            <div className="quiet-card p-8 text-center">
              <h2 className="text-lg font-semibold text-ink">No scraper runs yet</h2>
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold text-ink">Failed documents</h2>
        <div className="divide-y divide-black/10 overflow-hidden rounded-lg border border-black/10 bg-white">
          {failedDocuments.length > 0 ? (
            failedDocuments.map((doc) => (
              <div key={doc.id} className="p-4 text-sm">
                <p className="font-semibold text-ink">{doc.type || "Document"}</p>
                <p className="mt-1 break-words text-black/55">{doc.source_url}</p>
                <p className="mt-1 text-clay">{doc.download_error}</p>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-black/60">No failed document downloads in the latest records.</p>
          )}
        </div>
      </section>
    </div>
  );
}
