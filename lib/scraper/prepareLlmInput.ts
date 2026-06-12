import type { LlmReadyMeeting, PrimeGovDocument, PrimeGovMeeting } from "@/lib/types";
import { cleanText, slugify } from "@/lib/utils/slug";
import { extractPdfTextForDocument } from "./pdfText";

export const MAX_CHARS_FOR_LLM = 30000;

function findDoc(meeting: PrimeGovMeeting, type: PrimeGovDocument["type"]) {
  return meeting.documents.find((doc) => doc.type === type);
}

export function truncateForLLM(text?: string | null) {
  if (!text) return "";
  if (text.length <= MAX_CHARS_FOR_LLM) return text;

  return `${text.slice(
    0,
    MAX_CHARS_FOR_LLM
  )}\n\n[TRUNCATED: source text was longer than the LLM input limit.]`;
}

export function isMeetingCancelled(meeting: PrimeGovMeeting) {
  return (
    meeting.status === "Cancelled" ||
    meeting.title.toLowerCase().includes("cancelled") ||
    meeting.rowText.toLowerCase().includes("cancelled") ||
    meeting.documents.some((doc) => doc.type === "Notice of Cancellation")
  );
}

function sourceUrlFallback(meeting: PrimeGovMeeting) {
  return (
    meeting.sourceUrl ||
    meeting.meetingDetailsUrl ||
    meeting.documents.find((doc) => doc.type === "Agenda")?.url ||
    meeting.documents.find((doc) => doc.type === "Agenda Packet")?.url ||
    meeting.documents.find((doc) => doc.type === "Packet")?.url ||
    meeting.documents[0]?.url ||
    meeting.source ||
    null
  );
}

function meetingDateTimeText(meeting: PrimeGovMeeting) {
  const dateText = meeting.dateText || "";
  const timeText = meeting.timeText || "";
  if (!dateText) return null;
  if (!timeText || dateText.toLowerCase().includes(timeText.toLowerCase())) return dateText;
  return `${dateText} ${timeText}`.trim();
}

function documentSourceType(doc: PrimeGovDocument, fallback: string) {
  if (doc.localPath?.toLowerCase().endsWith(".html")) return `${fallback} HTML`;
  if (doc.localPath?.toLowerCase().endsWith(".pdf")) return `${fallback} PDF`;
  return fallback;
}

async function extractTextForDocument(doc: PrimeGovDocument | undefined | null) {
  if (!doc) return "";

  if (doc.extractedText && !doc.localPath) {
    return cleanText(doc.extractedText);
  }

  const extracted = await extractPdfTextForDocument(doc);
  return extracted?.text || "";
}

export async function buildLlmReadyMeeting(meeting: PrimeGovMeeting): Promise<LlmReadyMeeting> {
  const isCancelled = isMeetingCancelled(meeting);
  const htmlAgenda = findDoc(meeting, "HTML Agenda");
  const agendaPdf = findDoc(meeting, "Agenda");
  const packetPdf = findDoc(meeting, "Packet") || findDoc(meeting, "Agenda Packet");
  const publicCommentsPdf = findDoc(meeting, "Public Comments");
  const cancellationPdf = findDoc(meeting, "Notice of Cancellation");
  const fallbackSourceUrl = sourceUrlFallback(meeting);

  let selectedSourceType: string | null = null;
  let selectedSourceUrl: string | null = null;
  let selectedText = "";
  const extractionNotes = [...(meeting.extractionNotes || [])];

  if (isCancelled && !htmlAgenda && !agendaPdf && !packetPdf) {
    selectedSourceType = cancellationPdf ? "Notice of Cancellation" : "Cancellation";
    selectedSourceUrl = cancellationPdf?.url || fallbackSourceUrl;

    const cancellationText = cancellationPdf ? await extractPdfTextForDocument(cancellationPdf) : null;

    selectedText =
      cancellationText?.text ||
      `This meeting appears to be cancelled: ${meeting.title} ${meetingDateTimeText(meeting) || ""}.\n\nSource row:\n${meeting.rowText}`;

    if (!cancellationText?.text) {
      extractionNotes.push(
        cancellationPdf
          ? "Cancellation PDF had no extractable text."
          : "No cancellation document was available; used IQM2 row text."
      );
    }
  } else if (meeting.htmlAgendaText && meeting.htmlAgendaText.length > 500) {
    selectedSourceType = "HTML Agenda";
    selectedSourceUrl = htmlAgenda?.url || fallbackSourceUrl;
    selectedText = cleanText(meeting.htmlAgendaText);
  } else if (agendaPdf?.localPath || agendaPdf?.extractedText) {
    selectedSourceType = documentSourceType(agendaPdf, "Agenda");
    selectedSourceUrl = agendaPdf.url;

    selectedText = await extractTextForDocument(agendaPdf);

    if (!selectedText || selectedText.length < 300) {
      extractionNotes.push("Agenda document had little or no extractable text.");
    }
  } else if (packetPdf?.localPath || packetPdf?.extractedText) {
    selectedSourceType = documentSourceType(
      packetPdf,
      packetPdf.type === "Agenda Packet" ? "Agenda Packet" : "Packet"
    );
    selectedSourceUrl = packetPdf.url;

    selectedText = await extractTextForDocument(packetPdf);

    extractionNotes.push("Used packet document because no HTML agenda or agenda document was available.");
  } else if (meeting.detailText && meeting.detailText.length > 300) {
    selectedSourceType = "Detail Page";
    selectedSourceUrl = meeting.meetingDetailsUrl || fallbackSourceUrl;
    selectedText = cleanText(meeting.detailText);
    extractionNotes.push("Used IQM2 detail page text because no agenda document text was available.");
  } else if (meeting.rowText) {
    selectedSourceType = "Row Text";
    selectedSourceUrl = fallbackSourceUrl;
    selectedText = cleanText(meeting.rowText);
    extractionNotes.push("Used IQM2 row text because no usable agenda document text was available.");
  } else {
    selectedSourceType = htmlAgenda ? "HTML Agenda" : null;
    selectedSourceUrl =
      htmlAgenda?.url || agendaPdf?.url || packetPdf?.url || cancellationPdf?.url || fallbackSourceUrl;
    extractionNotes.push("No usable HTML agenda, agenda PDF, or packet PDF text was available.");
  }

  let publicCommentsSummaryInput: string | null = null;

  if (publicCommentsPdf?.localPath) {
    const commentsText = await extractPdfTextForDocument(publicCommentsPdf);

    if (commentsText?.text && commentsText.text.length > 200) {
      publicCommentsSummaryInput = truncateForLLM(commentsText.text);
    } else {
      extractionNotes.push("Public comments PDF had little or no extractable text.");
    }
  }

  return {
    ...meeting,
    id: slugify(`${meetingDateTimeText(meeting) || "no-date"}-${meeting.title}`),
    status: isCancelled
      ? "Cancelled"
      : meeting.status ||
        (meeting.section === "Current And Upcoming Meetings" ||
        meeting.section === "Upcoming Meetings"
        ? "Upcoming"
        : meeting.section === "Archived Meetings" || meeting.section === "Past Meetings"
          ? "Past"
          : "Unknown"),
    sourceType: selectedSourceType,
    sourceUrl: selectedSourceUrl || fallbackSourceUrl,
    extractionNotes,
    llmInputText: truncateForLLM(selectedText),
    publicCommentsInputText: publicCommentsSummaryInput
  };
}

export async function prepareLlmInput(meetings: PrimeGovMeeting[]) {
  const llmReadyMeetings: LlmReadyMeeting[] = [];

  for (const meeting of meetings) {
    llmReadyMeetings.push(await buildLlmReadyMeeting(meeting));
  }

  return llmReadyMeetings;
}
