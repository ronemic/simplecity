import { notFound } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { AddToGoogleCalendarLink } from "@/components/AddToGoogleCalendarLink";
import { SummaryCard } from "@/components/SummaryCard";
import { StatusPill } from "@/components/StatusPill";
import { getMeetingDetail } from "@/lib/db/queries";
import { normalizeJurisdictionSelection } from "@/lib/config/jurisdictions";
import { formatDisplayDate } from "@/lib/utils/date";

export const revalidate = 300;

export default async function MeetingDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ jurisdiction?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const jurisdiction = normalizeJurisdictionSelection(query.jurisdiction);
  const { meeting, cards, documents } = await getMeetingDetail(id, jurisdiction);

  if (!meeting) notFound();
  const jurisdictionLabel =
    meeting.jurisdiction_slug === "san-mateo-city"
      ? "San Mateo"
      : meeting.jurisdiction_slug === "santa-clara-county"
        ? "Santa Clara County"
        : meeting.jurisdiction_name || "Foster City";

  return (
    <div className="section-shell py-10">
      <div className="mb-8 max-w-4xl">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={meeting.status} />
          <span className="rounded-full border border-civic/15 bg-[#eef5ff] px-2.5 py-1 text-xs font-bold text-[#1646b8]">
            {jurisdictionLabel}
          </span>
          <span className="text-sm font-semibold text-black/70">
            {formatDisplayDate(meeting.date_text, meeting.meeting_datetime)}
          </span>
        </div>
        <h1 className="page-title mt-3">{meeting.title}</h1>
        <p className="page-copy mt-3 text-base">{meeting.meeting_type || "Meeting type not listed"}</p>
        <AddToGoogleCalendarLink meeting={meeting} className="mt-5" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section className="space-y-4">
          <div>
            <p className="label-eyebrow text-civic">Summary cards</p>
            <h2 className="section-title mt-1">Plain-English agenda items</h2>
          </div>
          {cards.length > 0 ? (
            <div className="grid gap-4">
              {cards.map((card) => (
                <SummaryCard key={card.id} card={card} />
              ))}
            </div>
          ) : (
            <div className="quiet-card p-8">
              <h3 className="text-xl font-bold text-ink">No published cards for this meeting yet</h3>
              <p className="mt-2 text-sm leading-6 text-black/70">
                Admins can regenerate summaries after agenda text has been extracted.
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="quiet-card p-5 sm:p-6">
            <h2 className="text-xl font-bold text-ink">Official documents</h2>
            <div className="mt-4 space-y-2">
              {documents.length > 0 ? (
                documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-3 rounded-lg border border-black/10 bg-white p-4 text-sm transition hover:-translate-y-0.5 hover:bg-black/[0.025] hover:shadow-sm focus-visible:focus-ring"
                  >
                    <FileText aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-civic" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{doc.type || "Document"}</span>
                      <span className="block break-words text-black/70">{doc.label || "Official source"}</span>
                    </span>
                    <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-black/40" />
                  </a>
                ))
              ) : (
                <p className="text-sm leading-6 text-black/70">No source documents are stored for this meeting yet.</p>
              )}
            </div>
          </section>

          <section className="quiet-card p-5 sm:p-6">
            <h2 className="text-xl font-bold text-ink">Public comment information</h2>
            <p className="mt-2 text-sm leading-6 text-black/75">
              {meeting.public_comments_input_text || "Not listed in the source document."}
            </p>
          </section>

          <section className="quiet-card p-5 sm:p-6">
            <h2 className="text-xl font-bold text-ink">Source note</h2>
            <p className="mt-2 text-sm leading-6 text-black/75">
              SimpleCity summarizes official public meeting documents. Always check the original source
              before making formal decisions.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
