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
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-civic">Meetings</p>
        <h1 className="mt-2 text-4xl font-black text-ink">Foster City agenda sources</h1>
        <p className="mt-3 text-base leading-7 text-black/65">
          Browse scraped current, upcoming, and archived meetings with their official source documents.
        </p>
      </div>

      <form className="mb-6 grid gap-3 rounded-lg border border-black/10 bg-white p-4 sm:grid-cols-[1fr_180px_auto]">
        <input
          name="q"
          defaultValue={params.q || ""}
          placeholder="Search meetings..."
          className="min-h-11 rounded-md border border-black/15 px-3 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
        />
        <select
          name="status"
          defaultValue={status}
          className="min-h-11 rounded-md border border-black/15 px-3 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
        >
          <option value="">All statuses</option>
          <option value="Upcoming">Upcoming</option>
          <option value="Past">Past</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <button className="min-h-11 rounded-md bg-civic px-4 text-sm font-bold text-white">Filter</button>
      </form>

      <MeetingList meetings={filtered} />
    </div>
  );
}
