import type { SupabaseClient } from "@supabase/supabase-js";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";

type ReconciliationMeeting = {
  id: string;
  title: string;
  meeting_datetime: string | null;
  section: string | null;
  source_url: string | null;
};

export type DuplicateMeetingPair = {
  duplicateId: string;
  canonicalId: string;
};

export type MeetingReconciliationReport = {
  staleStatusesFound: number;
  staleStatusesUpdated: number;
  duplicateCandidatesFound: number;
  orphanDuplicatesDeleted: number;
  protectedDuplicatesSkipped: number;
  duplicatePairs: DuplicateMeetingPair[];
};

function normalizedText(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedUrl(value?: string | null) {
  return String(value || "").replace(/\/$/, "").toLowerCase();
}

export function findMalformedCalendarDuplicatePairs(
  meetings: ReconciliationMeeting[],
  calendarUrl: string,
  protectedMeetingIds: ReadonlySet<string> = new Set()
) {
  const normalizedCalendarUrl = normalizedUrl(calendarUrl);
  const pairs: DuplicateMeetingPair[] = [];
  let protectedDuplicatesSkipped = 0;

  for (const candidate of meetings) {
    if (
      candidate.section !== "Unknown" ||
      normalizedUrl(candidate.source_url) !== normalizedCalendarUrl ||
      !candidate.meeting_datetime
    ) {
      continue;
    }

    const candidateTitle = normalizedText(candidate.title);
    const canonical = meetings
      .filter(
        (meeting) =>
          meeting.id !== candidate.id &&
          meeting.meeting_datetime === candidate.meeting_datetime &&
          meeting.section !== "Unknown" &&
          normalizedUrl(meeting.source_url) !== normalizedCalendarUrl
      )
      .sort((left, right) => normalizedText(right.title).length - normalizedText(left.title).length)
      .find((meeting) => {
        const canonicalTitle = normalizedText(meeting.title);
        return canonicalTitle.length >= 8 && candidateTitle.includes(canonicalTitle);
      });

    if (!canonical) continue;
    if (protectedMeetingIds.has(candidate.id)) {
      protectedDuplicatesSkipped += 1;
      continue;
    }

    pairs.push({ duplicateId: candidate.id, canonicalId: canonical.id });
  }

  return { pairs, protectedDuplicatesSkipped };
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadProtectedMeetingIds(
  supabase: SupabaseClient,
  duplicatePairs: DuplicateMeetingPair[]
) {
  const protectedIds = new Set<string>();
  const meetingIds = duplicatePairs.map((pair) => pair.duplicateId);
  if (meetingIds.length === 0) return protectedIds;

  const [documents, cards, translations] = await Promise.all([
    supabase.from("documents").select("meeting_id").in("meeting_id", meetingIds),
    supabase.from("summary_cards").select("meeting_id").in("meeting_id", meetingIds),
    supabase
      .from("meeting_translations")
      .select("meeting_id,locale")
      .in(
        "meeting_id",
        [...new Set(duplicatePairs.flatMap((pair) => [pair.duplicateId, pair.canonicalId]))]
      )
  ]);

  for (const result of [documents, cards]) {
    if (result.error) throw new Error(`Failed to inspect duplicate meeting dependencies: ${result.error.message}`);
    for (const row of result.data || []) {
      const meetingId = (row as { meeting_id?: string | null }).meeting_id;
      if (meetingId) protectedIds.add(meetingId);
    }
  }

  if (translations.error) {
    throw new Error(`Failed to inspect duplicate meeting translations: ${translations.error.message}`);
  }

  const localesByMeeting = new Map<string, Set<string>>();
  for (const row of translations.data || []) {
    const translation = row as { meeting_id?: string | null; locale?: string | null };
    if (!translation.meeting_id || !translation.locale) continue;
    const locales = localesByMeeting.get(translation.meeting_id) || new Set<string>();
    locales.add(translation.locale);
    localesByMeeting.set(translation.meeting_id, locales);
  }

  for (const pair of duplicatePairs) {
    const duplicateLocales = localesByMeeting.get(pair.duplicateId) || new Set<string>();
    const canonicalLocales = localesByMeeting.get(pair.canonicalId) || new Set<string>();
    if ([...duplicateLocales].some((locale) => !canonicalLocales.has(locale))) {
      protectedIds.add(pair.duplicateId);
    }
  }

  return protectedIds;
}

export async function reconcileMeetingRecords(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<MeetingReconciliationReport> {
  const nowIso = (options.now || new Date()).toISOString();
  const calendarUrl = jurisdiction.legistarUrl || jurisdiction.sourceUrl;
  let duplicateCandidates: ReconciliationMeeting[] = [];
  let duplicatePairs: DuplicateMeetingPair[] = [];
  let protectedDuplicatesSkipped = 0;

  if (jurisdiction.platform === "legistar" && calendarUrl) {
    const { data: candidates, error: candidateError } = await supabase
      .from("meetings")
      .select("id,title,meeting_datetime,section,source_url")
      .eq("jurisdiction_slug", jurisdiction.slug)
      .eq("section", "Unknown")
      .eq("source_url", calendarUrl)
      .not("meeting_datetime", "is", null);

    if (candidateError) {
      throw new Error(`Failed to load malformed meeting candidates: ${candidateError.message}`);
    }

    duplicateCandidates = (candidates || []) as ReconciliationMeeting[];
    const datetimes = [...new Set(duplicateCandidates.map((row) => row.meeting_datetime).filter(Boolean))] as string[];
    const canonicalMeetings: ReconciliationMeeting[] = [];

    for (const batch of chunks(datetimes, 50)) {
      const { data, error } = await supabase
        .from("meetings")
        .select("id,title,meeting_datetime,section,source_url")
        .eq("jurisdiction_slug", jurisdiction.slug)
        .neq("source_url", calendarUrl)
        .in("meeting_datetime", batch);

      if (error) throw new Error(`Failed to load canonical meetings: ${error.message}`);
      canonicalMeetings.push(...((data || []) as ReconciliationMeeting[]));
    }

    const unprotectedResult = findMalformedCalendarDuplicatePairs(
      [...duplicateCandidates, ...canonicalMeetings],
      calendarUrl
    );
    const protectedIds = await loadProtectedMeetingIds(supabase, unprotectedResult.pairs);
    const duplicateResult = findMalformedCalendarDuplicatePairs(
      [...duplicateCandidates, ...canonicalMeetings],
      calendarUrl,
      protectedIds
    );
    duplicatePairs = duplicateResult.pairs;
    protectedDuplicatesSkipped = duplicateResult.protectedDuplicatesSkipped;

    if (!options.dryRun && duplicatePairs.length > 0) {
      const { error } = await supabase
        .from("meetings")
        .delete()
        .eq("jurisdiction_slug", jurisdiction.slug)
        .in("id", duplicatePairs.map((pair) => pair.duplicateId));

      if (error) throw new Error(`Failed to delete orphan duplicate meetings: ${error.message}`);
    }
  }

  const { count: staleStatusesFound, error: staleCountError } = await supabase
    .from("meetings")
    .select("id", { count: "exact", head: true })
    .eq("jurisdiction_slug", jurisdiction.slug)
    .eq("status", "Upcoming")
    .lt("meeting_datetime", nowIso);

  if (staleCountError) throw new Error(`Failed to count stale meeting statuses: ${staleCountError.message}`);

  let staleStatusesUpdated = 0;
  if (!options.dryRun && (staleStatusesFound || 0) > 0) {
    const { data, error } = await supabase
      .from("meetings")
      .update({ status: "Past", section: "Past Meetings" })
      .eq("jurisdiction_slug", jurisdiction.slug)
      .eq("status", "Upcoming")
      .lt("meeting_datetime", nowIso)
      .select("id");

    if (error) throw new Error(`Failed to update stale meeting statuses: ${error.message}`);
    staleStatusesUpdated = data?.length || 0;
  }

  return {
    staleStatusesFound: staleStatusesFound || 0,
    staleStatusesUpdated,
    duplicateCandidatesFound: duplicateCandidates.length,
    orphanDuplicatesDeleted: options.dryRun ? 0 : duplicatePairs.length,
    protectedDuplicatesSkipped,
    duplicatePairs
  };
}
