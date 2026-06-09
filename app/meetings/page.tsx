import { MeetingList } from "@/components/MeetingList";
import { getMeetings } from "@/lib/db/queries";

export default async function MeetingsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const meetings = await getMeetings();
  const search = (params.q || "").toLowerCase();
  const status = params.status || "";

  const filtered = meetings.filter((meeting) => {
    const matchesSearch =
      !search ||
      [meeting.title, meeting.meeting_type, meeting.date_text, meeting.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    const matchesStatus = !status || meeting.status === status;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="section-shell py-10">
      <div className="mb-6 max-w-3xl">
        <p className="label-eyebrow text-civic">Meetings</p>
        <h1 className="page-title mt-2">Foster City agenda sources</h1>
        <p className="page-copy mt-3 text-base">
          Browse scraped current, upcoming, and archived meetings with their official source documents.
        </p>
      </div>

      <form className="quiet-card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_180px_auto] sm:p-5">
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

      <MeetingList meetings={filtered} />
    </div>
  );
}
