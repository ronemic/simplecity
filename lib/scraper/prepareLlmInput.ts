import type { LlmReadyMeeting, PrimeGovDocument, PrimeGovMeeting } from "@/lib/types";
import { cleanText, slugify } from "@/lib/utils/slug";
import { extractPdfTextForDocument } from "./pdfText";

export const MAX_CHARS_FOR_LLM = 30000;
const MIN_PRIMARY_SOURCE_CHARS = 300;
const MIN_HTML_AGENDA_CHARS = 500;
const MIN_ROW_SOURCE_CHARS = 40;

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

type SourceCandidate = {
  sourceType: string;
  sourceUrl: string | null;
  minimumCharacters: number;
  loadText: () => Promise<string> | string;
  emptyNote: string;
  selectedNote?: string;
};

async function selectFirstUsableSource(
  candidates: SourceCandidate[],
  extractionNotes: string[]
) {
  let firstNonEmpty: {
    sourceType: string;
    sourceUrl: string | null;
    text: string;
  } | null = null;

  for (const candidate of candidates) {
    const text = cleanText(await candidate.loadText());

    if (text && !firstNonEmpty) {
      firstNonEmpty = {
        sourceType: candidate.sourceType,
        sourceUrl: candidate.sourceUrl,
        text
      };
    }

    if (text.length >= candidate.minimumCharacters) {
      if (candidate.selectedNote) extractionNotes.push(candidate.selectedNote);
      return {
        sourceType: candidate.sourceType,
        sourceUrl: candidate.sourceUrl,
        text
      };
    }

    extractionNotes.push(candidate.emptyNote);
  }

  if (firstNonEmpty) {
    extractionNotes.push(
      `Used ${firstNonEmpty.sourceType} even though it had less text than expected.`
    );
    return firstNonEmpty;
  }

  return null;
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
  } else {
    const candidates: SourceCandidate[] = [];

    const htmlAgendaText = meeting.htmlAgendaText;
    if (htmlAgendaText) {
      candidates.push({
        sourceType: "HTML Agenda",
        sourceUrl: htmlAgenda?.url || fallbackSourceUrl,
        minimumCharacters: MIN_HTML_AGENDA_CHARS,
        loadText: () => cleanText(htmlAgendaText),
        emptyNote: "HTML agenda had little or no usable agenda text."
      });
    }

    if (agendaPdf?.localPath || agendaPdf?.extractedText) {
      candidates.push({
        sourceType: documentSourceType(agendaPdf, "Agenda"),
        sourceUrl: agendaPdf.url,
        minimumCharacters: MIN_PRIMARY_SOURCE_CHARS,
        loadText: () => extractTextForDocument(agendaPdf),
        emptyNote: "Agenda document had little or no extractable text."
      });
    }

    if (packetPdf?.localPath || packetPdf?.extractedText) {
      candidates.push({
        sourceType: documentSourceType(
          packetPdf,
          packetPdf.type === "Agenda Packet" ? "Agenda Packet" : "Packet"
        ),
        sourceUrl: packetPdf.url,
        minimumCharacters: MIN_PRIMARY_SOURCE_CHARS,
        loadText: () => extractTextForDocument(packetPdf),
        emptyNote: "Packet document had little or no extractable text.",
        selectedNote: "Used packet document because a higher-priority agenda source was unavailable or unreadable."
      });
    }

    const detailText = meeting.detailText;
    if (detailText) {
      candidates.push({
        sourceType: "Detail Page",
        sourceUrl: meeting.meetingDetailsUrl || fallbackSourceUrl,
        minimumCharacters: MIN_PRIMARY_SOURCE_CHARS,
        loadText: () => cleanText(detailText),
        emptyNote: "Detail page had little or no usable agenda text.",
        selectedNote: "Used IQM2 detail page text because no agenda document text was available."
      });
    }

    if (meeting.rowText) {
      candidates.push({
        sourceType: "Row Text",
        sourceUrl: fallbackSourceUrl,
        minimumCharacters: MIN_ROW_SOURCE_CHARS,
        loadText: () => cleanText(meeting.rowText),
        emptyNote: "Meeting row text had little or no usable agenda text.",
        selectedNote: "Used IQM2 row text because no usable agenda document text was available."
      });
    }

    const selectedSource = await selectFirstUsableSource(candidates, extractionNotes);

    if (selectedSource) {
      selectedSourceType = selectedSource.sourceType;
      selectedSourceUrl = selectedSource.sourceUrl;
      selectedText = selectedSource.text;
    } else {
      selectedSourceType = htmlAgenda ? "HTML Agenda" : null;
      selectedSourceUrl =
        htmlAgenda?.url || agendaPdf?.url || packetPdf?.url || cancellationPdf?.url || fallbackSourceUrl;
      extractionNotes.push("No usable HTML agenda, agenda PDF, packet PDF, detail text, or row text was available.");
    }
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
