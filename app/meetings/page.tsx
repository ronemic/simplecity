import { ListboxSelect } from "@/components/ListboxSelect";
import { MeetingList } from "@/components/MeetingList";
import { getMeetings } from "@/lib/db/queries";
import {
  getJurisdictionLabel,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";

export const revalidate = 300;

export default async function MeetingsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; status?: string; jurisdiction?: string; month?: string; date?: string }>;
}) {
  const params = await searchParams;
  const jurisdiction = normalizeJurisdictionSelection(params.jurisdiction);
  const publicJurisdiction = toPublicJurisdictionSlug(jurisdiction);
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const search = params.q || "";
  const status = params.status || "";
  const meetings = await getMeetings({ search, status, jurisdiction });
  const statusOptions = [
    { value: "", label: "All statuses" },
    { value: "Upcoming", label: "Upcoming" },
    { value: "Past", label: "Past" },
    { value: "Cancelled", label: "Cancelled" }
  ];

  return (
    <div className="section-shell py-10">
      <div className="mb-6 max-w-3xl">
        <p className="label-eyebrow text-civic">Meetings</p>
        <h1 className="page-title mt-2">{jurisdictionLabel} meeting calendar</h1>
        <p className="page-copy mt-3 text-base">
          See every scraped meeting by month and by day, with search and status filters.
        </p>
      </div>

      <form className="quiet-card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_180px_auto] sm:p-5">
        <input type="hidden" name="jurisdiction" value={publicJurisdiction} />
        {params.month ? <input type="hidden" name="month" value={params.month} /> : null}
        {params.date ? <input type="hidden" name="date" value={params.date} /> : null}
        <input
          name="q"
          defaultValue={params.q || ""}
          placeholder="Search meetings..."
          className="input-control"
        />
        <ListboxSelect
          key={status}
          name="status"
          label="Status"
          value={status}
          options={statusOptions}
        />
        <button className="action-primary">Filter</button>
      </form>

      <MeetingList
        meetings={meetings}
        jurisdiction={publicJurisdiction}
        search={search}
        status={status}
        month={params.month}
        selectedDate={params.date}
      />
    </div>
  );
}
