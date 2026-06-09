import type { LlmReadyMeeting, MeetingRow, PrimeGovDocument } from "@/lib/types";

export function meetingRowToLlmReadyMeeting(row: MeetingRow): LlmReadyMeeting {
  const raw = (row.raw || {}) as Partial<LlmReadyMeeting>;

  return {
    section: (row.section || raw.section || "Unknown") as LlmReadyMeeting["section"],
    title: row.title,
    dateText: row.date_text,
    meetingType: row.meeting_type || raw.meetingType || "",
    rowText: row.row_text || raw.rowText || "",
    status: (row.status || raw.status || "Unknown") as LlmReadyMeeting["status"],
    sourceType: row.source_type || raw.sourceType || null,
    sourceUrl: row.source_url || raw.sourceUrl || null,
    hasHtmlAgenda: Boolean(row.has_html_agenda),
    hasPdf: Boolean(row.has_pdf),
    documents: (raw.documents || []) as PrimeGovDocument[],
    htmlAgendaText: raw.htmlAgendaText || null,
    extractionNotes: Array.isArray(row.extraction_notes)
      ? (row.extraction_notes as string[])
      : raw.extractionNotes || [],
    llmInputText: row.llm_input_text || raw.llmInputText || "",
    publicCommentsInputText: row.public_comments_input_text || raw.publicCommentsInputText || null,
    id: row.external_id || row.id
  };
}
