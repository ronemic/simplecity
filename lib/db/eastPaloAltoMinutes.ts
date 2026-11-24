import type { SupabaseClient } from "@supabase/supabase-js";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import { loadStoredMeetingsWithDocuments, storeAttachedDocuments } from "@/lib/db/storedMeetingDocuments";
import { attachCouncilMinutesFromAgendaPackets } from "@/lib/sources/east-palo-alto";
import type { LlmReadyMeeting } from "@/lib/types";

const LOOKBACK_DAYS = 180;
const DOCUMENT_TYPES = ["Agenda", "Agenda Packet", "Minutes", "Accessible Minutes"];

/**
 * East Palo Alto's Granicus table drops a meeting once it has passed, so a live
 * scrape never holds a past meeting's agenda packet together with the earlier
 * meeting whose minutes it carries. Both are stored: each packet was saved while
 * its meeting was upcoming. Attach minutes from the stored packets and return
 * the meetings that gained minutes, ready for outcome reconciliation.
 */
export async function attachEastPaloAltoMinutesFromStoredPackets(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  log: (message: string) => void = () => undefined
) {
  const meetings = await loadStoredMeetingsWithDocuments(supabase, jurisdiction, {
    lookbackDays: LOOKBACK_DAYS,
    documentTypes: DOCUMENT_TYPES
  });

  const minutesBefore = new Map(
    meetings.map((meeting) => [meeting.id, new Set(meeting.documents.map((document) => document.url))])
  );
  const attached = attachCouncilMinutesFromAgendaPackets(meetings, log);
  if (attached === 0) return [];

  const gained: LlmReadyMeeting[] = [];
  for (const meeting of meetings) {
    const added = meeting.documents.filter(
      (document) => !minutesBefore.get(meeting.id as string)?.has(document.url)
    );
    if (added.length === 0) continue;
    await storeAttachedDocuments(supabase, jurisdiction, meeting, added);
    log(`Stored ${added.map((document) => document.label).join("; ")} on the ${meeting.dateText} ${meeting.title} meeting.`);
    gained.push({ ...meeting, status: "Past" });
  }
  return gained;
}
