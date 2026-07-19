import type { LlmReadyMeeting, PrimeGovDocument } from "@/lib/types";
import {
  getJurisdictionBySlug,
  getServiceSupabaseClientForJurisdiction,
  type JurisdictionConfig
} from "@/lib/config/jurisdictions";
import { reconcileDecisionOutcomesForMeeting } from "@/lib/db/upsertDecisionOutcomes";
import { DECISION_OUTCOME_JURISDICTIONS } from "@/lib/outcomes/extractDecisionOutcome";

const PAGE_SIZE = 100;

type StoredMeeting = {
  id: string;
  jurisdiction_name: string | null;
  jurisdiction_slug: string | null;
  platform: string | null;
  date_text: string | null;
  time_text: string | null;
  status: string | null;
  source_url: string | null;
  raw: unknown;
};

type StoredDocument = {
  meeting_id: string | null;
  type: PrimeGovDocument["type"];
  label: string | null;
  source_url: string;
  extracted_text: string | null;
};

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function requestedJurisdictions() {
  const requested = argument("jurisdiction");
  const slugs = requested && requested !== "all"
    ? [requested]
    : Array.from(DECISION_OUTCOME_JURISDICTIONS);

  return slugs.map((slug) => {
    const jurisdiction = getJurisdictionBySlug(slug);
    if (!jurisdiction || !DECISION_OUTCOME_JURISDICTIONS.has(jurisdiction.slug)) {
      throw new Error(`Unsupported decision-outcome jurisdiction: ${slug}`);
    }
    return jurisdiction;
  });
}

function mergeDocuments(meeting: StoredMeeting, documents: StoredDocument[]) {
  const raw = meeting.raw && typeof meeting.raw === "object"
    ? (meeting.raw as Partial<LlmReadyMeeting>)
    : {};
  const byUrl = new Map(
    (raw.documents || []).map((document) => [document.url, document])
  );

  for (const document of documents) {
    const existing = byUrl.get(document.source_url);
    byUrl.set(document.source_url, {
      ...existing,
      type: document.type,
      label: document.label || existing?.label || document.type,
      url: document.source_url,
      extractedText: document.extracted_text || existing?.extractedText || null
    });
  }

  return Array.from(byUrl.values());
}

function toLlmReadyMeeting(
  meeting: StoredMeeting,
  documents: StoredDocument[],
  jurisdiction: JurisdictionConfig
): LlmReadyMeeting | null {
  if (!meeting.raw || typeof meeting.raw !== "object") return null;
  const raw = meeting.raw as LlmReadyMeeting;

  return {
    ...raw,
    id: meeting.id,
    jurisdictionName: meeting.jurisdiction_name || jurisdiction.name,
    jurisdictionSlug: meeting.jurisdiction_slug || jurisdiction.slug,
    platform: meeting.platform || jurisdiction.platform,
    dateText: meeting.date_text || raw.dateText,
    timeText: meeting.time_text || raw.timeText,
    status: "Past",
    sourceUrl: meeting.source_url || raw.sourceUrl,
    documents: mergeDocuments(meeting, documents)
  };
}

async function loadPastMeetings(jurisdiction: JurisdictionConfig) {
  const supabase = getServiceSupabaseClientForJurisdiction(jurisdiction.slug);
  const meetings: StoredMeeting[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("meetings")
      .select("id,jurisdiction_name,jurisdiction_slug,platform,date_text,time_text,status,source_url,raw")
      .eq("jurisdiction_slug", jurisdiction.slug)
      .eq("status", "Past")
      .order("meeting_datetime", { ascending: false, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load ${jurisdiction.name} meetings: ${error.message}`);

    meetings.push(...((data || []) as unknown as StoredMeeting[]));
    if ((data || []).length < PAGE_SIZE) break;
  }

  return { supabase, meetings };
}

async function backfillJurisdiction(jurisdiction: JurisdictionConfig, execute: boolean) {
  const { supabase, meetings } = await loadPastMeetings(jurisdiction);
  let found = 0;
  let upserted = 0;
  let rejectedAmbiguous = 0;
  let resultItemsFound = 0;
  let resultItemsMatched = 0;
  let resultItemsUnmatched = 0;
  let duplicateCardsDetected = 0;
  let duplicateCardsResolved = 0;

  for (let index = 0; index < meetings.length; index += PAGE_SIZE) {
    const batch = meetings.slice(index, index + PAGE_SIZE);
    const meetingIds = batch.map((meeting) => meeting.id);
    const { data: documents, error } = await supabase
      .from("documents")
      .select("meeting_id,type,label,source_url,extracted_text")
      .in("meeting_id", meetingIds)
      .in("type", ["Minutes", "Accessible Minutes"]);
    if (error) throw new Error(`Failed to load ${jurisdiction.name} minutes: ${error.message}`);

    const documentsByMeeting = new Map<string, StoredDocument[]>();
    for (const document of (documents || []) as unknown as StoredDocument[]) {
      if (!document.meeting_id) continue;
      documentsByMeeting.set(document.meeting_id, [
        ...(documentsByMeeting.get(document.meeting_id) || []),
        document
      ]);
    }

    for (const stored of batch) {
      const meeting = toLlmReadyMeeting(
        stored,
        documentsByMeeting.get(stored.id) || [],
        jurisdiction
      );
      if (!meeting) continue;

      if (execute) {
        const result = await reconcileDecisionOutcomesForMeeting(
          supabase,
          stored.id,
          meeting,
          jurisdiction
        );
        found += result.outcomesFound;
        upserted += result.outcomesUpserted;
        rejectedAmbiguous += result.outcomesRejectedAmbiguous;
        resultItemsFound += result.resultItemsFound;
        resultItemsMatched += result.resultItemsMatched;
        resultItemsUnmatched += result.resultItemsUnmatched;
        duplicateCardsDetected += result.duplicateCardsDetected;
        duplicateCardsResolved += result.duplicateCardsResolved;
      }
    }
  }

  console.log(
    `${jurisdiction.name}: checked ${meetings.length} past meeting(s)` +
      (execute
        ? `, found ${found} card outcome proposal(s), matched ${resultItemsMatched} of ${resultItemsFound} result-bearing agenda item(s), upserted ${upserted}, left ${resultItemsUnmatched} unmatched, withheld ${rejectedAmbiguous} ambiguous assignment(s), and resolved ${duplicateCardsResolved} of ${duplicateCardsDetected} duplicate card(s).`
        : ".")
  );
}

async function main() {
  const execute = process.argv.includes("--execute");
  if (!execute) {
    console.log("Dry run only. Pass --execute after applying the decision_outcomes migration.");
  }

  for (const jurisdiction of requestedJurisdictions()) {
    await backfillJurisdiction(jurisdiction, execute);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
