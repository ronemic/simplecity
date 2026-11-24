import type { SupabaseClient } from "@supabase/supabase-js";
import { usesRegionalSupabase, type JurisdictionConfig } from "@/lib/config/jurisdictions";
import { documentExtractedTextForStorage } from "@/lib/db/upsertMeetings";
import type { LlmReadyMeeting, PrimeGovDocument } from "@/lib/types";

const PAGE_SIZE = 100;

type StoredMeeting = {
  id: string;
  title: string | null;
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
  meeting_id: string;
  type: PrimeGovDocument["type"];
  label: string | null;
  source_url: string;
  extracted_text: string | null;
  download_error: string | null;
};

/**
 * Rebuild the stored meetings of the last `lookbackDays` as pipeline meetings,
 * with their stored documents of the given types merged in, so minutes found
 * after the fact can be attached and reconciled like a fresh scrape.
 */
export async function loadStoredMeetingsWithDocuments(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  options: { lookbackDays: number; documentTypes: string[] }
): Promise<LlmReadyMeeting[]> {
  const since = new Date(Date.now() - options.lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const stored: StoredMeeting[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("meetings")
      .select("id,title,jurisdiction_name,jurisdiction_slug,platform,date_text,time_text,status,source_url,raw")
      .eq("jurisdiction_slug", jurisdiction.slug)
      .gte("meeting_datetime", since)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load stored ${jurisdiction.name} meetings: ${error.message}`);
    stored.push(...((data || []) as StoredMeeting[]));
    if ((data || []).length < PAGE_SIZE) break;
  }

  const documentsByMeeting = new Map<string, StoredDocument[]>();
  for (let index = 0; index < stored.length; index += 25) {
    const ids = stored.slice(index, index + 25).map((meeting) => meeting.id);
    const { data, error } = await supabase
      .from("documents")
      .select("meeting_id,type,label,source_url,extracted_text,download_error")
      .in("meeting_id", ids)
      .in("type", options.documentTypes);
    if (error) throw new Error(`Failed to load stored ${jurisdiction.name} documents: ${error.message}`);
    for (const document of (data || []) as StoredDocument[]) {
      documentsByMeeting.set(document.meeting_id, [
        ...(documentsByMeeting.get(document.meeting_id) || []),
        document
      ]);
    }
  }

  return stored
    .filter((meeting) => meeting.raw && typeof meeting.raw === "object")
    .map((meeting) => {
      const raw = meeting.raw as LlmReadyMeeting;
      const documents = new Map((raw.documents || []).map((document) => [document.url, document]));
      for (const document of documentsByMeeting.get(meeting.id) || []) {
        documents.set(document.source_url, {
          ...documents.get(document.source_url),
          type: document.type,
          label: document.label || document.type,
          url: document.source_url,
          extractedText: document.extracted_text || null,
          downloadError: document.download_error
        });
      }
      return {
        ...raw,
        id: meeting.id,
        title: meeting.title || raw.title,
        bodyName: raw.bodyName || meeting.title,
        jurisdictionName: meeting.jurisdiction_name || jurisdiction.name,
        jurisdictionSlug: meeting.jurisdiction_slug || jurisdiction.slug,
        platform: meeting.platform || jurisdiction.platform,
        dateText: meeting.date_text || raw.dateText,
        timeText: meeting.time_text || raw.timeText,
        status: meeting.status === "Past" ? "Past" : raw.status,
        sourceUrl: meeting.source_url || raw.sourceUrl,
        documents: Array.from(documents.values())
      } as LlmReadyMeeting;
    });
}

/** Store documents newly attached to a stored meeting. */
export async function storeAttachedDocuments(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  meeting: LlmReadyMeeting,
  added: PrimeGovDocument[]
) {
  const rows = added.map((document) => {
    const text = documentExtractedTextForStorage(document.type, document.extractedText) || "";
    return {
      jurisdiction_name: jurisdiction.name,
      jurisdiction_slug: jurisdiction.slug,
      platform: jurisdiction.platform,
      meeting_id: meeting.id,
      type: document.type,
      label: document.label,
      source_url: document.url,
      download_error: null,
      extracted_text: text,
      extraction_character_count: text.length,
      is_scanned: false
    };
  });
  const { error } = await supabase
    .from("documents")
    .upsert(rows, {
      onConflict: usesRegionalSupabase(jurisdiction) ? "jurisdiction_slug,source_url" : "source_url"
    });
  if (error) {
    throw new Error(`Failed to store ${jurisdiction.name} minutes for ${meeting.dateText}: ${error.message}`);
  }
}
