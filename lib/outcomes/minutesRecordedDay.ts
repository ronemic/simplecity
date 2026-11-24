import { civicCalendarDay } from "@/lib/utils/date";

const MINUTES_HEADER_CHARACTERS = 800;
const MONTH_DAY_YEAR =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s*\\d{4}";
const HEADER_MEETING_DATE = new RegExp(
  `\\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\\s+(${MONTH_DAY_YEAR})`,
  "gi"
);
/**
 * A title line without a weekday: "Open Space Management Advisory Board
 * Regular Meeting Minutes October 22, 2026" (Carpinteria). The date must follow
 * directly, so "approve the meeting minutes of April 1" does not qualify.
 */
const TITLE_MEETING_DATE = new RegExp(`\\bmeeting\\s+minutes\\s+(${MONTH_DAY_YEAR})`, "gi");
/**
 * Short minutes can reach the adjournment or consent list inside the header
 * window. A date that schedules another meeting ("the next regular meeting is
 * scheduled for Friday, July 10") or names minutes being approved ("Approval of
 * the City Council Special Meeting Minutes June 18, 2026") is not the meeting
 * these minutes record.
 */
const NOT_RECORDED_BEFORE = /\b(?:next|scheduled|adjourn\w*|continued|until|reconvene\w*|approv\w*|adopt\w*)\b[^.]{0,60}$/i;

/**
 * The civic day ("2026-09-17") a minutes document records, from the meeting
 * line in its header: "City Council Regular Meeting Minutes Thursday, September
 * 17, 2026" or "... Regular Meeting Minutes October 22, 2026". Null when the
 * header names no such date.
 *
 * Minutes plainly labelled "Minutes" can record another meeting: the Los Altos
 * Hills Oct 15, 2026 meetings carry the Sep 17 minutes they approved.
 */
export function minutesRecordedDay(text: string | null | undefined) {
  const header = String(text || "").slice(0, MINUTES_HEADER_CHARACTERS).replace(/\s+/g, " ");
  const recorded = [...header.matchAll(HEADER_MEETING_DATE), ...header.matchAll(TITLE_MEETING_DATE)]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .find((match) =>
      !NOT_RECORDED_BEFORE.test(header.slice(Math.max(0, (match.index ?? 0) - 80), match.index))
    );
  return recorded ? civicCalendarDay(recorded[1]) : null;
}
