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
    meeting.title.toLowerCase().includes("cancelled") ||
    meeting.documents.some((doc) => doc.type === "Notice of Cancellation")
  );
}

export async function buildLlmReadyMeeting(meeting: PrimeGovMeeting): Promise<LlmReadyMeeting> {
  const isCancelled = isMeetingCancelled(meeting);
  const htmlAgenda = findDoc(meeting, "HTML Agenda");
  const agendaPdf = findDoc(meeting, "Agenda");
  const packetPdf = findDoc(meeting, "Packet");
  const publicCommentsPdf = findDoc(meeting, "Public Comments");
  const cancellationPdf = findDoc(meeting, "Notice of Cancellation");

  let selectedSourceType: string | null = null;
  let selectedSourceUrl: string | null = null;
  let selectedText = "";
  const extractionNotes = [...(meeting.extractionNotes || [])];

  if (isCancelled) {
    selectedSourceType = "Notice of Cancellation";
    selectedSourceUrl = cancellationPdf?.url || htmlAgenda?.url || agendaPdf?.url || null;

    const cancellationText = cancellationPdf ? await extractPdfTextForDocument(cancellationPdf) : null;

    selectedText =
      cancellationText?.text ||
      `This meeting appears to be cancelled: ${meeting.title} ${meeting.dateText || ""}`;

    if (!cancellationText?.text) {
      extractionNotes.push("Cancellation PDF had no extractable text.");
    }
  } else if (meeting.htmlAgendaText && meeting.htmlAgendaText.length > 500) {
    selectedSourceType = "HTML Agenda";
    selectedSourceUrl = htmlAgenda?.url || null;
    selectedText = cleanText(meeting.htmlAgendaText);
  } else if (agendaPdf?.localPath) {
    selectedSourceType = "Agenda PDF";
    selectedSourceUrl = agendaPdf.url;

    const agendaText = await extractPdfTextForDocument(agendaPdf);
    selectedText = agendaText?.text || "";

    if (!selectedText || selectedText.length < 300) {
      extractionNotes.push("Agenda PDF had little or no extractable text.");
    }
  } else if (packetPdf?.localPath) {
    selectedSourceType = "Packet PDF";
    selectedSourceUrl = packetPdf.url;

    const packetText = await extractPdfTextForDocument(packetPdf);
    selectedText = packetText?.text || "";

    extractionNotes.push("Used packet PDF because no HTML agenda or agenda PDF was available.");
  } else {
    selectedSourceType = htmlAgenda ? "HTML Agenda" : null;
    selectedSourceUrl = htmlAgenda?.url || agendaPdf?.url || packetPdf?.url || cancellationPdf?.url || null;
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
    id: slugify(`${meeting.dateText || "no-date"}-${meeting.title}`),
    status: isCancelled
      ? "Cancelled"
      : meeting.section === "Current And Upcoming Meetings"
        ? "Upcoming"
        : "Past",
    sourceType: selectedSourceType,
    sourceUrl: selectedSourceUrl,
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
