import { CalendarPlus, ExternalLink } from "lucide-react";
import type { MeetingRow } from "@/lib/types";
import { buildGoogleCalendarUrl } from "@/lib/utils/calendar";
import { displayMeetingText } from "@/lib/utils/meetingDisplay";
import { cn } from "@/lib/utils/cn";
import { type Locale, t } from "@/lib/i18n";

type AddToGoogleCalendarLinkProps = {
  meeting: Pick<MeetingRow, "title" | "meeting_type" | "date_text" | "meeting_datetime" | "source_url">;
  className?: string;
  compact?: boolean;
  locale?: Locale;
};

export function AddToGoogleCalendarLink({
  meeting,
  className,
  compact = false,
  locale = "en"
}: AddToGoogleCalendarLinkProps) {
  const calendarUrl = buildGoogleCalendarUrl(meeting);
  if (!calendarUrl) return null;

  return (
    <a
      href={calendarUrl}
      target="_blank"
      rel="noreferrer"
      className={cn(
        compact
          ? "inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-black/20 bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm transition hover:bg-black/[0.03] hover:shadow-md active:translate-y-px"
          : "action-secondary",
        className
      )}
      aria-label={
        locale === "es"
          ? `Agregar ${displayMeetingText(meeting.title)} a Google Calendar`
          : `Add ${displayMeetingText(meeting.title)} to Google Calendar`
      }
    >
      <CalendarPlus aria-hidden className="h-4 w-4" />
      {compact ? t(locale, "googleCalendar") : t(locale, "addToGoogleCalendar")}
      <ExternalLink aria-hidden className="h-3.5 w-3.5" />
    </a>
  );
}
