import type { SupabaseClient } from "@supabase/supabase-js";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import {
  canonicalEastPaloAltoDateTime,
  eastPaloAltoMeetingExternalId
} from "@/lib/sources/east-palo-alto";

const PAGE_SIZE = 100;
// A copy holding only these was created from the /meetings page and carries no
// content of its own.
const DISPOSABLE_DOCUMENT_TYPES = new Set(["Meeting Details", "Video", "Zoom"]);

type StoredMeeting = {
  id: string;
  external_id: string;
  title: string | null;
  body: string | null;
  date_text: string | null;
  time_text: string | null;
  created_at: string | null;
  summary_cards: Array<{ count: number }>;
  decision_outcomes: Array<{ count: number }>;
  documents: Array<{ type: string | null }>;
};

function cardCount(meeting: StoredMeeting) {
  return meeting.summary_cards[0]?.count || 0;
}

function outcomeCount(meeting: StoredMeeting) {
  return meeting.decision_outcomes[0]?.count || 0;
}

function isEmptyCopy(meeting: StoredMeeting) {
  return (
    cardCount(meeting) === 0 &&
    outcomeCount(meeting) === 0 &&
    meeting.documents.every((document) => DISPOSABLE_DOCUMENT_TYPES.has(String(document.type)))
  );
}

/**
 * Meetings stored before date formats were normalized carry ids built from
 * "09/01/2026"-style dates, so the same meeting can exist twice. Group stored
 * records by their normalized id, delete copies that hold nothing, and give
 * the remaining record the normalized id so the next upsert updates it instead
 * of inserting a new one. A group where more than one copy holds content is
 * left alone and reported.
 */
export async function reconcileEastPaloAltoMeetingIds(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  options: { log?: (message: string) => void } = {}
) {
  const log = options.log || (() => undefined);
  const stored: StoredMeeting[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("meetings")
      .select("id,external_id,title,body:raw->>bodyName,date_text,time_text,created_at,summary_cards(count),decision_outcomes(count),documents(type)")
      .eq("jurisdiction_slug", jurisdiction.slug)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load East Palo Alto meetings: ${error.message}`);
    stored.push(...((data || []) as unknown as StoredMeeting[]));
    if ((data || []).length < PAGE_SIZE) break;
  }

  const groups = new Map<string, StoredMeeting[]>();
  for (const meeting of stored) {
    const bodyName = String(meeting.body || meeting.title || "").trim();
    if (!bodyName || !meeting.date_text) continue;
    const canonical = canonicalEastPaloAltoDateTime(meeting.date_text, meeting.time_text);
    const externalId = eastPaloAltoMeetingExternalId(bodyName, canonical.dateText, canonical.timeText);
    groups.set(externalId, [...(groups.get(externalId) || []), meeting]);
  }

  let deleted = 0;
  let renamed = 0;
  let conflicts = 0;
  for (const [externalId, meetings] of groups) {
    const keeper = [...meetings].sort((left, right) =>
      cardCount(right) - cardCount(left) ||
      outcomeCount(right) - outcomeCount(left) ||
      Number(right.external_id === externalId) - Number(left.external_id === externalId) ||
      String(left.created_at).localeCompare(String(right.created_at))
    )[0];
    const others = meetings.filter((meeting) => meeting.id !== keeper.id);
    if (others.some((meeting) => !isEmptyCopy(meeting))) {
      conflicts += 1;
      log(`East Palo Alto meeting ${keeper.date_text} ${keeper.title} has ${meetings.length} records with content; left unchanged.`);
      continue;
    }
    if (others.length > 0) {
      const { error } = await supabase.from("meetings").delete().in("id", others.map((meeting) => meeting.id));
      if (error) throw new Error(`Failed to delete duplicate East Palo Alto meetings: ${error.message}`);
      deleted += others.length;
    }
    if (keeper.external_id !== externalId) {
      const { error } = await supabase
        .from("meetings")
        .update({ external_id: externalId })
        .eq("id", keeper.id);
      if (error) throw new Error(`Failed to normalize East Palo Alto meeting id: ${error.message}`);
      renamed += 1;
    }
  }
  if (deleted || renamed || conflicts) {
    log(`East Palo Alto meeting ids: deleted ${deleted} empty duplicate(s), normalized ${renamed} id(s), left ${conflicts} group(s) with content in more than one record.`);
  }
  return { deleted, renamed, conflicts };
}
