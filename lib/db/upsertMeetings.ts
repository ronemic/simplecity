import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import { meetingSourceHash } from "@/lib/db/meetingSourceHash";
import { externalMeetingId } from "@/lib/utils/slug";
import { parseMeetingDate } from "@/lib/utils/date";

type UpsertedMeeting = {
  externalId: string;
  id: string;
  meeting: LlmReadyMeeting;
  sourceHash: string;
  summarizedSourceHash: string | null;
  existingCardCount: number;
};

type PreservedCardAdminState = {
  is_published: boolean | null;
  is_featured: boolean | null;
  admin_notes: string | null;
};

function sanitizeDatabaseString(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
}

function sanitizeForDatabase<T>(value: T): T {
  if (typeof value === "string") return sanitizeDatabaseString(value) as T;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForDatabase(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeForDatabase(item)])
    ) as T;
  }

  return value;
}

function normalizeCardKey(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function exactCardKey(agendaItem?: string | null, sourceUrl?: string | null) {
  return `${normalizeCardKey(agendaItem)}|${normalizeCardKey(sourceUrl)}`;
}

function meetingDateTimeText(meeting: LlmReadyMeeting) {
  const dateText = meeting.dateText || "";
  const timeText = meeting.timeText || "";
  if (!dateText) return null;
  if (!timeText || dateText.toLowerCase().includes(timeText.toLowerCase())) return dateText;
  return `${dateText} ${timeText}`.trim();
}

async function countCardsForMeeting(supabase: SupabaseClient, meetingId: string) {
  const { count, error } = await supabase
    .from("summary_cards")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", meetingId);

  if (error) throw new Error(`Failed to count existing cards: ${error.message}`);
  return count || 0;
}

export async function markMeetingSummarized(
  supabase: SupabaseClient,
  meetingId: string,
  sourceHash?: string | null
) {
  const update: Record<string, string> = {
    cards_generated_at: new Date().toISOString()
  };

  if (sourceHash) update.summarized_source_hash = sourceHash;

  const { error } = await supabase.from("meetings").update(update).eq("id", meetingId);
  if (error) throw new Error(`Failed to mark meeting summarized: ${error.message}`);
}

export async function setMeetingSummarizedSourceHash(
  supabase: SupabaseClient,
  meetingId: string,
  sourceHash: string
) {
  const { error } = await supabase
    .from("meetings")
    .update({ summarized_source_hash: sourceHash })
    .eq("id", meetingId);

  if (error) throw new Error(`Failed to backfill summarized source hash: ${error.message}`);
}

export async function upsertMeetings(
  supabase: SupabaseClient,
  meetings: LlmReadyMeeting[],
  scrapedAt?: string,
  jurisdiction?: JurisdictionConfig
) {
  const upserted: UpsertedMeeting[] = [];

  for (const meeting of meetings) {
    const safeMeeting = sanitizeForDatabase(meeting);
    const firstSourceUrl = meeting.sourceUrl || meeting.documents[0]?.url || null;
    const externalId = externalMeetingId(meetingDateTimeText(meeting), meeting.title, firstSourceUrl);
    const sourceHash = meetingSourceHash(safeMeeting);
    const jurisdictionColumns = jurisdiction
      ? {
          jurisdiction_name: jurisdiction.name,
          jurisdiction_slug: jurisdiction.slug,
          platform: jurisdiction.platform
        }
      : {};

    const { data, error } = await supabase
      .from("meetings")
      .upsert(
        {
          ...jurisdictionColumns,
          external_id: externalId,
          title: safeMeeting.title,
          meeting_type: safeMeeting.meetingType,
          date_text: safeMeeting.dateText,
          meeting_datetime: parseMeetingDate(meetingDateTimeText(safeMeeting)),
          section: safeMeeting.section,
          status: safeMeeting.status,
          source_type: safeMeeting.sourceType,
          source_url: firstSourceUrl,
          row_text: safeMeeting.rowText,
          has_html_agenda: safeMeeting.hasHtmlAgenda,
          has_pdf: safeMeeting.hasPdf,
          llm_input_text: safeMeeting.llmInputText,
          public_comments_input_text: safeMeeting.publicCommentsInputText,
          source_hash: sourceHash,
          extraction_notes: safeMeeting.extractionNotes,
          raw: safeMeeting,
          scraped_at: scrapedAt || new Date().toISOString()
        },
        { onConflict: "external_id" }
      )
      .select("id,summarized_source_hash")
      .single();

    if (error) throw new Error(`Failed to upsert meeting ${meeting.title}: ${error.message}`);
    if (!data?.id) throw new Error(`Failed to read meeting id for ${meeting.title}.`);

    for (const doc of safeMeeting.documents) {
      const { error: docError } = await supabase.from("documents").upsert(
        {
          ...jurisdictionColumns,
          meeting_id: data.id,
          type: doc.type,
          label: doc.label,
          source_url: doc.url,
          local_path: doc.localPath || null,
          storage_path: doc.storagePath || null,
          bytes: doc.bytes || null,
          download_error: doc.downloadError || null,
          extracted_text: doc.extractedText || null,
          extraction_character_count: doc.extractionCharacterCount || null,
          is_scanned: doc.isScanned || false
        },
        { onConflict: "source_url" }
      );

      if (docError) {
        throw new Error(`Failed to upsert document ${doc.url}: ${docError.message}`);
      }
    }

    const existingCardCount = await countCardsForMeeting(supabase, data.id);

    upserted.push({
      externalId,
      id: data.id,
      meeting: safeMeeting,
      sourceHash,
      summarizedSourceHash: data.summarized_source_hash || null,
      existingCardCount
    });
  }

  return upserted;
}

export async function replaceSummaryCardsForMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  summary: SimpleCitySummary,
  rawLlmJson: unknown,
  options: {
    allowEmptyReplacement?: boolean;
    sourceHash?: string | null;
    jurisdiction?: JurisdictionConfig | null;
  } = {}
) {
  const { data: existingCards, error: existingError } = await supabase
    .from("summary_cards")
    .select("agenda_item,source_url,is_published,is_featured,admin_notes")
    .eq("meeting_id", meetingId);

  if (existingError) throw new Error(`Failed to read old cards: ${existingError.message}`);

  const preservedByExactKey = new Map<string, PreservedCardAdminState>();
  const preservedByAgendaKey = new Map<string, PreservedCardAdminState>();

  for (const card of existingCards || []) {
    const state = {
      is_published: card.is_published,
      is_featured: card.is_featured,
      admin_notes: card.admin_notes
    };

    preservedByExactKey.set(exactCardKey(card.agenda_item, card.source_url), state);
    preservedByAgendaKey.set(normalizeCardKey(card.agenda_item), state);
  }

  if (summary.cards.length === 0) {
    if (existingCards?.length && !options.allowEmptyReplacement) {
      return [];
    }

    const { error: deleteError } = await supabase
      .from("summary_cards")
      .delete()
      .eq("meeting_id", meetingId);

    if (deleteError) throw new Error(`Failed to delete old cards: ${deleteError.message}`);

    if (!existingCards?.length) {
      await markMeetingSummarized(supabase, meetingId, options.sourceHash);
    }

    return [];
  }

  const { error: deleteError } = await supabase
    .from("summary_cards")
    .delete()
    .eq("meeting_id", meetingId);

  if (deleteError) throw new Error(`Failed to delete old cards: ${deleteError.message}`);

  const rows = summary.cards.map((card) => {
    const preserved =
      preservedByExactKey.get(exactCardKey(card.agendaItem, card.source)) ||
      preservedByAgendaKey.get(normalizeCardKey(card.agendaItem));

    return sanitizeForDatabase({
      ...(options.jurisdiction
        ? {
            jurisdiction_name: options.jurisdiction.name,
            jurisdiction_slug: options.jurisdiction.slug,
            platform: options.jurisdiction.platform
          }
        : {}),
      meeting_id: meetingId,
      agenda_item: card.agendaItem,
      what_is_happening: card.whatIsHappening,
      why_it_matters: card.whyItMatters,
      who_it_affects: card.whoItAffects,
      category_tags: card.categoryTags,
      status: card.status,
      comment_window_opens: card.commentWindow.opens,
      comment_window_closes: card.commentWindow.closes,
      how_to_act_attend: card.howToAct.attend,
      how_to_act_email: card.howToAct.email,
      how_to_act_submit_comment: card.howToAct.submitComment,
      source_url: card.source,
      confidence: card.confidence,
      is_published:
        typeof preserved?.is_published === "boolean" ? preserved.is_published : true,
      is_featured:
        typeof preserved?.is_featured === "boolean" ? preserved.is_featured : false,
      admin_notes: preserved?.admin_notes || null,
      raw_llm_json: rawLlmJson
    });
  });

  const { data, error } = await supabase.from("summary_cards").insert(rows).select("id");

  if (error) throw new Error(`Failed to insert summary cards: ${error.message}`);

  await markMeetingSummarized(supabase, meetingId, options.sourceHash);

  return data || [];
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  input: {
    adminEmail: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  }
) {
  await supabase.from("admin_audit_log").insert({
    admin_email: input.adminEmail,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId || null,
    before: input.before || null,
    after: input.after || null
  });
}
