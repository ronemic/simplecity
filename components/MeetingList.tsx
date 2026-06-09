import Link from "next/link";
import { CalendarDays, FileText } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import type { MeetingRow } from "@/lib/types";
import { formatDisplayDate } from "@/lib/utils/date";

export function MeetingList({ meetings }: { meetings: MeetingRow[] }) {
  if (meetings.length === 0) {
    return (
      <div className="quiet-card p-8 text-center">
        <FileText aria-hidden className="mx-auto h-10 w-10 text-black/35" />
        <h2 className="mt-3 text-lg font-semibold text-ink">No meetings loaded yet</h2>
        <p className="mt-2 text-sm leading-6 text-black/60">
          Run the scraper from the admin portal or local scripts to populate official Foster City meetings.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-black/10 overflow-hidden rounded-lg border border-black/10 bg-white">
      {meetings.map((meeting) => (
        <Link
          key={meeting.id}
          href={`/meetings/${meeting.id}`}
          className="grid gap-3 p-4 transition hover:bg-black/[0.025] focus-visible:focus-ring sm:grid-cols-[1fr_auto]"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={meeting.status} />
              <span className="inline-flex items-center gap-1 text-xs font-medium text-black/55">
                <CalendarDays aria-hidden className="h-3.5 w-3.5" />
                {formatDisplayDate(meeting.date_text, meeting.meeting_datetime)}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-snug text-ink">{meeting.title}</h2>
            <p className="mt-1 text-sm text-black/60">{meeting.meeting_type || "Meeting type not listed"}</p>
          </div>
          <span className="self-center text-sm font-semibold text-civic">Open</span>
        </Link>
      ))}
    </div>
  );
}
