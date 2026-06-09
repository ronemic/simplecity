import { CalendarPlus, ExternalLink } from "lucide-react";
import type { MeetingRow } from "@/lib/types";
import { buildGoogleCalendarUrl } from "@/lib/utils/calendar";
import { cn } from "@/lib/utils/cn";

type AddToGoogleCalendarLinkProps = {
  meeting: Pick<MeetingRow, "title" | "meeting_type" | "date_text" | "meeting_datetime" | "source_url">;
  className?: string;
  compact?: boolean;
};

export function AddToGoogleCalendarLink({
  meeting,
  className,
  compact = false
}: AddToGoogleCalendarLinkProps) {
  const calendarUrl = buildGoogleCalendarUrl(meeting);
  if (!calendarUrl) return null;

  return (
    <a
      href={calendarUrl}
      target="_blank"
      rel="noreferrer"
      className={cn("action-secondary", className)}
      aria-label={`Add ${meeting.title} to Google Calendar`}
    >
      <CalendarPlus aria-hidden className="h-4 w-4" />
      {compact ? "Google Calendar" : "Add to Google Calendar"}
      <ExternalLink aria-hidden className="h-3.5 w-3.5" />
    </a>
  );
}
