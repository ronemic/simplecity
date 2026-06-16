import { ListboxSelect } from "@/components/ListboxSelect";
import { MeetingList } from "@/components/MeetingList";
import { getMeetings } from "@/lib/db/queries";
import { cookies } from "next/headers";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionLabel,
  normalizeJurisdictionSelection
} from "@/lib/config/jurisdictions";

export const revalidate = 300;

export default async function MeetingsPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    month?: string;
    date?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const jurisdiction = normalizeJurisdictionSelection(
    cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const search = params.q || "";
  const status = params.status || "";
  const view = params.view === "list" ? "list" : "calendar";
  const meetings = await getMeetings({ search, status, jurisdiction });
  const meetingListKey = [
    jurisdiction,
    search,
    status,
    view,
    params.month || "",
    params.date || ""
  ].join("|");
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
        <h1 className="page-title mt-2">{jurisdictionLabel} meetings</h1>
        <p className="page-copy mt-3 text-base">
          See every scraped meeting by month, day, or list, with search and status filters.
        </p>
      </div>

      <form className="quiet-card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_180px_auto] sm:p-5">
        <input type="hidden" name="view" data-form-sync="view" defaultValue={view} disabled={view === "calendar"} />
        <input type="hidden" name="month" data-form-sync="month" defaultValue={params.month || ""} disabled={!params.month} />
        <input type="hidden" name="date" data-form-sync="date" defaultValue={params.date || ""} disabled={!params.date} />
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
        key={meetingListKey}
        meetings={meetings}
        month={params.month}
        selectedDate={params.date}
        view={view}
      />
    </div>
  );
}
