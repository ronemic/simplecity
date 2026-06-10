import { MeetingList } from "@/components/MeetingList";
import { getMeetings } from "@/lib/db/queries";
import {
  getJurisdictionLabel,
  normalizeJurisdictionSelection
} from "@/lib/config/jurisdictions";

export const revalidate = 300;

export default async function MeetingsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; status?: string; jurisdiction?: string }>;
}) {
  const params = await searchParams;
  const jurisdiction = normalizeJurisdictionSelection(params.jurisdiction);
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const search = params.q || "";
  const status = params.status || "";
  const meetings = await getMeetings({ search, status, jurisdiction });

  return (
    <div className="section-shell py-10">
      <div className="mb-6 max-w-3xl">
        <p className="label-eyebrow text-civic">Meetings</p>
        <h1 className="page-title mt-2">{jurisdictionLabel} agenda sources</h1>
        <p className="page-copy mt-3 text-base">
          Browse scraped current, upcoming, and archived meetings with their official source documents.
        </p>
      </div>

      <form className="quiet-card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_180px_auto] sm:p-5">
        <input type="hidden" name="jurisdiction" value={jurisdiction} />
        <input
          name="q"
          defaultValue={params.q || ""}
          placeholder="Search meetings..."
          className="input-control"
        />
        <select
          name="status"
          defaultValue={status}
          className="input-control"
        >
          <option value="">All statuses</option>
          <option value="Upcoming">Upcoming</option>
          <option value="Past">Past</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <button className="action-primary">Filter</button>
      </form>

      <MeetingList meetings={meetings} />
    </div>
  );
}
