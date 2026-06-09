import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";
import { externalMeetingId } from "@/lib/utils/slug";
import { parseMeetingDate } from "@/lib/utils/date";

type UpsertedMeeting = {
  externalId: string;
  id: string;
  meeting: LlmReadyMeeting;
};

export async function upsertMeetings(
  supabase: SupabaseClient,
  meetings: LlmReadyMeeting[],
  scrapedAt?: string
) {
  const upserted: UpsertedMeeting[] = [];

  for (const meeting of meetings) {
    const firstSourceUrl = meeting.sourceUrl || meeting.documents[0]?.url || null;
    const externalId = externalMeetingId(meeting.dateText, meeting.title, firstSourceUrl);

    const { data, error } = await supabase
      .from("meetings")
      .upsert(
        {
          external_id: externalId,
          title: meeting.title,
          meeting_type: meeting.meetingType,
          date_text: meeting.dateText,
          meeting_datetime: parseMeetingDate(meeting.dateText),
          section: meeting.section,
          status: meeting.status,
          source_type: meeting.sourceType,
          source_url: firstSourceUrl,
          row_text: meeting.rowText,
          has_html_agenda: meeting.hasHtmlAgenda,
          has_pdf: meeting.hasPdf,
          llm_input_text: meeting.llmInputText,
          public_comments_input_text: meeting.publicCommentsInputText,
          extraction_notes: meeting.extractionNotes,
          raw: meeting,
          scraped_at: scrapedAt || new Date().toISOString()
        },
        { onConflict: "external_id" }
      )
      .select("id")
      .single();

    if (error) throw new Error(`Failed to upsert meeting ${meeting.title}: ${error.message}`);
    if (!data?.id) throw new Error(`Failed to read meeting id for ${meeting.title}.`);

    for (const doc of meeting.documents) {
      const { error: docError } = await supabase.from("documents").upsert(
        {
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

    upserted.push({ externalId, id: data.id, meeting });
  }

  return upserted;
}

export async function replaceSummaryCardsForMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  summary: SimpleCitySummary,
  rawLlmJson: unknown
) {
  const { error: deleteError } = await supabase
    .from("summary_cards")
    .delete()
    .eq("meeting_id", meetingId);

  if (deleteError) throw new Error(`Failed to delete old cards: ${deleteError.message}`);

  if (summary.cards.length === 0) return [];

  const rows = summary.cards.map((card) => ({
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
    is_published: true,
    raw_llm_json: rawLlmJson
  }));

  const { data, error } = await supabase.from("summary_cards").insert(rows).select("id");

  if (error) throw new Error(`Failed to insert summary cards: ${error.message}`);

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
