import { CalendarDays, FileText } from "lucide-react";
import { AddToGoogleCalendarLink } from "@/components/AddToGoogleCalendarLink";
import { StatusPill } from "@/components/StatusPill";
import { PendingLink } from "@/components/PendingLink";
import type { MeetingRow } from "@/lib/types";
import { formatDisplayDate } from "@/lib/utils/date";

function jurisdictionLabel(meeting: MeetingRow) {
  return meeting.jurisdiction_name || (meeting.jurisdiction_slug === "san-mateo-city" ? "San Mateo City" : "Foster City");
}

export function MeetingList({ meetings }: { meetings: MeetingRow[] }) {
  if (meetings.length === 0) {
    return (
      <div className="quiet-card p-8 text-center">
        <FileText aria-hidden className="mx-auto h-10 w-10 text-black/40" />
        <h2 className="mt-3 text-xl font-bold text-ink">No meetings loaded yet</h2>
        <p className="mt-2 text-sm leading-6 text-black/70">
          Run the scraper from the admin portal or local scripts to populate official city meetings.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-soft">
      {meetings.map((meeting) => (
        <article
          key={meeting.id}
          className="grid gap-4 border-t border-black/10 p-5 transition first:border-t-0 hover:bg-black/[0.025] sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={meeting.status} />
              <span className="rounded-full border border-civic/15 bg-[#eef5ff] px-2.5 py-1 text-xs font-bold text-[#1646b8]">
                {jurisdictionLabel(meeting)}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-black/70">
                <CalendarDays aria-hidden className="h-3.5 w-3.5" />
                {formatDisplayDate(meeting.date_text, meeting.meeting_datetime)}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-bold leading-snug text-ink">{meeting.title}</h2>
            <p className="mt-1 text-sm text-black/70">{meeting.meeting_type || "Meeting type not listed"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <AddToGoogleCalendarLink meeting={meeting} compact className="min-h-10 px-4 py-2" />
            <PendingLink
              href={`/meetings/${meeting.id}?jurisdiction=${meeting.jurisdiction_slug || "foster-city"}`}
              className="action-tertiary min-h-10 px-3 py-2 text-civic"
              pendingLabel="Opening meeting"
            >
              Open
            </PendingLink>
          </div>
        </article>
      ))}
    </div>
  );
}
