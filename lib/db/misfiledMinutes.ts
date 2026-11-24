import type { SupabaseClient } from "@supabase/supabase-js";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import { loadStoredMeetingsWithDocuments, storeAttachedDocuments } from "@/lib/db/storedMeetingDocuments";
import { minutesRecordedDay } from "@/lib/outcomes/minutesRecordedDay";
import type { LlmReadyMeeting, PrimeGovDocument } from "@/lib/types";
import { civicCalendarDay } from "@/lib/utils/date";

const LOOKBACK_DAYS = 180;
const MINUTES_TYPES = ["Minutes", "Accessible Minutes"];

/**
 * Jurisdictions seen filing a meeting's minutes on the later meeting that
 * approved them: Carpinteria's advisory boards (Sep 3 Tree Advisory Board
 * minutes on Nov 19; Sep 17 and Oct 22 Open Space board minutes on Oct 22 and
 * Nov 19) and Los Altos Hills (Sep 17 council minutes on Oct 15).
 */
export const MISFILED_MINUTES_JURISDICTIONS = new Set(["carpinteria", "los-altos-hills"]);

const BODY_NOISE_WORDS = new Set([
  "regular", "special", "meeting", "minutes", "agenda", "the", "of", "and", "city", "town", "carpinteria"
]);
const MONTH_WORDS =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/g;

/** "City Council Regular Meeting September 17, 2026" -> "council". */
function bodyKey(title: string | null | undefined) {
  return String(title || "")
    .toLowerCase()
    .replace(MONTH_WORDS, " ")
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter((word) => word && !BODY_NOISE_WORDS.has(word))
    .join(" ");
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/** "2026-09-17" -> "September 17, 2026". */
function longDate(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${date}, ${year}`;
}

function meetingKind(value: string | null | undefined) {
  const text = String(value || "");
  if (/\bspecial\b/i.test(text)) return "special";
  if (/\bregular\b/i.test(text)) return "regular";
  return null;
}

function readableMinutes(meeting: LlmReadyMeeting) {
  return meeting.documents.filter(
    (document) => MINUTES_TYPES.includes(document.type) && Boolean(document.extractedText?.trim())
  );
}

export type MisfiledMinutesMove = {
  source: LlmReadyMeeting;
  target: LlmReadyMeeting;
  document: PrimeGovDocument;
};

/**
 * Minutes stored on one meeting whose header records another stored meeting of
 * the same body, with a copy for that meeting. The copy keeps the source URL
 * plus a "#minutes-<day>" fragment, so the later meeting's own copy is left as
 * the scraper stored it.
 */
export function findMisfiledMinutesMoves(
  meetings: LlmReadyMeeting[],
  log: (message: string) => void = () => undefined
): MisfiledMinutesMove[] {
  const moves: MisfiledMinutesMove[] = [];
  const claimed = new Set<string>();
  for (const source of meetings) {
    const sourceDay = civicCalendarDay(source.dateText);
    for (const document of readableMinutes(source)) {
      const recordedDay = minutesRecordedDay(document.extractedText);
      if (!recordedDay || !sourceDay || recordedDay === sourceDay) continue;

      const body = bodyKey(source.title || source.bodyName);
      let candidates = meetings.filter((meeting) =>
        meeting !== source &&
        civicCalendarDay(meeting.dateText) === recordedDay &&
        bodyKey(meeting.title || meeting.bodyName) === body
      );
      // Los Altos Hills held a special and a regular council meeting on Sep 17;
      // each set of minutes names its kind in its title.
      const kind = meetingKind(String(document.extractedText || "").slice(0, 400));
      if (candidates.length > 1 && kind) {
        candidates = candidates.filter((meeting) => meetingKind(meeting.title) === kind);
      }
      if (candidates.length !== 1) {
        if (candidates.length > 1) {
          log(`Minutes of ${recordedDay} on the ${source.dateText} ${source.title} meeting matched ${candidates.length} meetings; not attached.`);
        }
        continue;
      }

      const target = candidates[0];
      const url = `${document.url}#minutes-${recordedDay}`;
      // Skip a meeting that already has this copy or minutes of its own. Minutes
      // with no dated header are taken to be its own.
      const hasOwnMinutes = readableMinutes(target).some((candidate) => {
        const day = minutesRecordedDay(candidate.extractedText);
        return candidate.url === url || day === null || day === recordedDay;
      });
      if (hasOwnMinutes || claimed.has(`${target.id}|${recordedDay}`)) continue;
      claimed.add(`${target.id}|${recordedDay}`);

      moves.push({
        source,
        target,
        document: {
          type: document.type,
          // The label's date must be the minutes' own date: outcome matching
          // drops minutes whose label names a different meeting day.
          label: `Minutes of ${longDate(recordedDay)} (filed with the ${source.dateText} meeting)`,
          url,
          extractedText: document.extractedText,
          extractionCharacterCount: document.extractedText?.length,
          isScanned: false
        }
      });
    }
  }
  return moves;
}

/**
 * Attach minutes filed on a later meeting to the stored meeting they record,
 * and return the meetings that gained minutes, ready for outcome
 * reconciliation. `execute: false` only reports the moves.
 */
export async function attachMisfiledMinutesToRecordedMeetings(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  log: (message: string) => void = () => undefined,
  options: { execute?: boolean } = {}
) {
  const meetings = await loadStoredMeetingsWithDocuments(supabase, jurisdiction, {
    lookbackDays: LOOKBACK_DAYS,
    documentTypes: MINUTES_TYPES
  });
  const gained: LlmReadyMeeting[] = [];
  for (const move of findMisfiledMinutesMoves(meetings, log)) {
    log(`${options.execute === false ? "Would store" : "Stored"} ${move.document.label} on the ${move.target.dateText} ${move.target.title} meeting.`);
    if (options.execute === false) {
      gained.push({ ...move.target, status: "Past" });
      continue;
    }
    move.target.documents.push(move.document);
    await storeAttachedDocuments(supabase, jurisdiction, move.target, [move.document]);
    gained.push({ ...move.target, status: "Past" });
  }
  return gained;
}
