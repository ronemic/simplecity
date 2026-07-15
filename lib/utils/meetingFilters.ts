import { getJurisdictionDisplayLabel } from "@/lib/config/jurisdictions";
import { type Locale, t } from "@/lib/i18n";
import type { MeetingRow } from "@/lib/types";
import { formatDisplayDate } from "@/lib/utils/date";
import { matchesNormalizedDecisionSearchText } from "@/lib/utils/decisionFilters";
import { displayMeetingTitle, displayMeetingType } from "@/lib/utils/meetingDisplay";

export type MeetingSearchField = "title" | "date" | "type" | "jurisdiction";

export type MeetingSearchMatch = {
  field: MeetingSearchField;
  text: string;
};

export function meetingSearchFields(
  meeting: MeetingRow,
  locale: Locale = "en"
): MeetingSearchMatch[] {
  const fields: MeetingSearchMatch[] = [
    {
      field: "title",
      text: displayMeetingTitle(
        meeting,
        locale === "es" ? "Reunión no indicada" : "Meeting not listed",
        locale
      )
    },
    {
      field: "date",
      text: formatDisplayDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)
    },
    {
      field: "type",
      text: displayMeetingType(meeting, t(locale, "meetingTypeNotListed"), locale)
    },
    {
      field: "jurisdiction",
      text: getJurisdictionDisplayLabel(meeting.jurisdiction_slug || meeting.jurisdiction_name)
    }
  ];

  return fields.filter((field) => Boolean(field.text));
}

export function meetingSearchMatch(
  meeting: MeetingRow,
  search: string,
  locale: Locale = "en"
) {
  if (!search.trim()) return null;

  return meetingSearchFields(meeting, locale).find((field) =>
    matchesNormalizedDecisionSearchText(field.text, search)
  ) || null;
}

export function matchesMeetingFilters(
  meeting: MeetingRow,
  search: string,
  locale: Locale = "en"
) {
  if (!search.trim()) return true;
  return meetingSearchMatch(meeting, search, locale) !== null;
}
