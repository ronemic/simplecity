import "@/lib/env/bootstrap";
import {
  getJurisdictions,
  getServiceSupabaseClientForJurisdiction
} from "@/lib/config/jurisdictions";

const PAGE_SIZE = 500;

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

async function paged<T>(load: (from: number, to: number) => PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>, context: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await load(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${context}: ${error.message}`);
    const page = (Array.isArray(data) ? data : []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function main() {
  const since = argument("since") || "2026-01-01";
  const requestedJurisdiction = argument("jurisdiction");
  if (Number.isNaN(Date.parse(since))) throw new Error(`Invalid --since date: ${since}`);

  const reports = [];
  const jurisdictions = getJurisdictions().filter(
    (jurisdiction) => !requestedJurisdiction || jurisdiction.slug === requestedJurisdiction
  );
  if (jurisdictions.length === 0) {
    throw new Error(`Unknown --jurisdiction: ${requestedJurisdiction}`);
  }

  for (const jurisdiction of jurisdictions) {
    const supabase = getServiceSupabaseClientForJurisdiction(jurisdiction.slug);
    const meetings = await paged<{
      id: string;
      title: string;
      date_text: string | null;
      meeting_datetime: string | null;
    }>(
      (from, to) => supabase
        .from("meetings")
        .select("id,title,date_text,meeting_datetime")
        .eq("jurisdiction_slug", jurisdiction.slug)
        .eq("status", "Past")
        .gte("meeting_datetime", since)
        .order("meeting_datetime", { ascending: false, nullsFirst: false })
        .range(from, to),
      `${jurisdiction.name} meetings audit failed`
    );
    const meetingIds = new Set(meetings.map((meeting) => meeting.id));
    const documents = await paged<{
      meeting_id: string | null;
      type: string;
      source_url: string;
      extracted_text: string | null;
      download_error: string | null;
    }>(
      (from, to) => supabase
        .from("documents")
        .select("meeting_id,type,source_url,extracted_text,download_error")
        .eq("jurisdiction_slug", jurisdiction.slug)
        .in("type", ["Minutes", "Accessible Minutes"])
        .range(from, to),
      `${jurisdiction.name} minutes audit failed`
    );
    const relevantDocuments = documents.filter(
      (document) => document.meeting_id && meetingIds.has(document.meeting_id)
    );
    const minutesMeetingIds = new Set(
      relevantDocuments.flatMap((document) => document.meeting_id ? [document.meeting_id] : [])
    );
    const extractedMeetingIds = new Set(
      relevantDocuments.flatMap((document) =>
        document.meeting_id && (document.extracted_text || "").trim().length >= 40
          ? [document.meeting_id]
          : []
      )
    );
    const failedMeetingIds = new Set(
      relevantDocuments.flatMap((document) =>
        document.meeting_id && document.download_error ? [document.meeting_id] : []
      )
    );
    const latestMinutesMeeting = meetings.find((meeting) => minutesMeetingIds.has(meeting.id));

    reports.push({
      jurisdiction: jurisdiction.slug,
      platform: jurisdiction.platform,
      since,
      pastMeetings: meetings.length,
      meetingsWithMinutes: minutesMeetingIds.size,
      minutesMeetingCoveragePercent: meetings.length
        ? Math.round((minutesMeetingIds.size / meetings.length) * 1000) / 10
        : null,
      meetingsWithExtractedMinutes: extractedMeetingIds.size,
      meetingsWithMinuteDownloadErrors: failedMeetingIds.size,
      latestMinutesMeetingDate:
        latestMinutesMeeting?.meeting_datetime || latestMinutesMeeting?.date_text || null,
      minutesDocuments: relevantDocuments.length,
      downloadErrorExamples: relevantDocuments
        .filter((document) => document.download_error)
        .slice(0, 5)
        .map((document) => ({
          sourceUrl: document.source_url,
          error: document.download_error
        })),
      extractedExamples: relevantDocuments
        .filter((document) => (document.extracted_text || "").trim().length >= 40)
        .slice(0, 3)
        .map((document) => document.source_url)
    });
  }

  console.log(JSON.stringify(reports, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
