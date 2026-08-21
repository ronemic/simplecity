import type { LlmReadyMeeting, PrimeGovDocument, PrimeGovMeeting } from "@/lib/types";
import { cleanText, slugify } from "@/lib/utils/slug";
import { extractPdfTextForDocument } from "./pdfText";
import { enrichMenloParkMeetingTimesFromAgendaText } from "@/lib/sources/menlo-park";
import {
  currentMeetingSourceText,
  extractAgendaItemsFromText,
  formatAgendaItemContexts,
  MAX_MEETING_WIDE_CONTEXT_CHARS,
  MEETING_WIDE_CONTEXT_HEADING,
  mergeAgendaItems
} from "@/lib/scraper/agendaItemContext";
import {
  hasUsableOfficialDocumentText,
  isUsableOfficialSourceText
} from "@/lib/scraper/documentUsability";
import { isUsablePrimeGovHtmlAgendaText } from "@/lib/scraper/primegov";

export const MAX_CHARS_FOR_LLM = 30000;
export const MAX_ATTACHMENT_CONTEXT_CHARS_PER_ITEM = 2500;
const MIN_PRIMARY_SOURCE_CHARS = 300;
const MIN_HTML_AGENDA_CHARS = 500;
const MIN_ROW_SOURCE_CHARS = 40;
const MIN_ATTACHMENT_CONTEXT_CHARS = 200;
/**
 * Some source adapters already supply one stable row per real official agenda
 * item. Their PDFs are still valuable as evidence, but their page layouts must
 * not be parsed into a second, competing item list: line wrapping can otherwise
 * turn the middle of a recommendation into a synthetic decision.
 */
export function authoritativeAgendaItemSourceIds(
  meeting: Pick<PrimeGovMeeting, "agendaItemInventoryComplete" | "items">
) {
  if (!meeting.agendaItemInventoryComplete) return null;
  const ids = (meeting.items || [])
    .map((item) => item.externalId)
    .filter((id): id is string => Boolean(id?.trim()));
  return ids.length > 0 ? [...new Set(ids)] : null;
}

export function normalizeSourceText(text = "") {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findDoc(meeting: PrimeGovMeeting, type: PrimeGovDocument["type"]) {
  return meeting.documents.find((doc) => doc.type === type);
}

function findDocs(meeting: PrimeGovMeeting, type: PrimeGovDocument["type"]) {
  return meeting.documents.filter((doc) => doc.type === type);
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
  const cancellationText = `${String(meeting.title || "")} ${String(
    meeting.rowText || ""
  )}`;
  return (
    meeting.status === "Cancelled" ||
    /\b(?:cancell?ed|cancellation)\b/i.test(cancellationText) ||
    Boolean(meeting.documents?.some((doc) => doc.type === "Notice of Cancellation"))
  );
}

export function isCancellationNoticeText(text = "") {
  const normalized = normalizeSourceText(text);
  return (
    /\bcancellation notice\b/i.test(normalized) ||
    /\b(?:this|the)\s+(?:regular|special|scheduled\s+)?meeting\b.{0,160}\b(?:has been|was|is)\s+cancell?ed\b/is.test(
      normalized
    )
  );
}

function sourceUrlFallback(meeting: PrimeGovMeeting) {
  return (
    meeting.sourceUrl ||
    meeting.meetingDetailsUrl ||
    meeting.documents.find((doc) => doc.type === "Agenda")?.url ||
    meeting.documents.find((doc) => doc.type === "Accessible Agenda")?.url ||
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
    return normalizeSourceText(doc.extractedText);
  }

  const extracted = await extractPdfTextForDocument(doc);
  return extracted?.text || "";
}

async function extractUsableTextForDocument(
  doc: PrimeGovDocument,
  minimumCharacters: number
) {
  const text = await extractTextForDocument(doc);
  return hasUsableOfficialDocumentText(
    { ...doc, extractedText: text },
    minimumCharacters
  )
    ? text
    : "";
}

function attachmentPriority(doc: PrimeGovDocument) {
  const label = doc.label.toLowerCase();

  if (doc.type === "Staff Report" || /staff\s+report/.test(label)) return 0;
  if (doc.type === "Public Comment" || /public\s+(?:hearing\s+)?notice/.test(label)) return 1;
  if (doc.type === "Contract" || doc.type === "Resolution" || doc.type === "Ordinance") return 2;
  if (doc.type === "Exhibit") return 3;
  return 4;
}

function rankedItemAttachments(item: NonNullable<PrimeGovMeeting["items"]>[number]) {
  const seenUrls = new Set<string>();

  return (item.attachments || [])
    .filter((doc) => {
      if (doc.type === "Public Comment" || doc.type === "Public Comments") return false;
      const normalizedUrl = doc.url.trim().toLowerCase();
      if (!normalizedUrl || seenUrls.has(normalizedUrl)) return false;
      seenUrls.add(normalizedUrl);
      return true;
    })
    .map((doc, index) => ({ doc, index }))
    .sort(
      (left, right) =>
        attachmentPriority(left.doc) - attachmentPriority(right.doc) || left.index - right.index
    )
    .map(({ doc }) => doc);
}

export async function appendAgendaItemAttachmentContext(
  meeting: PrimeGovMeeting,
  baseText: string
) {
  if (!meeting.items?.length) {
    return { text: baseText, included: 0 };
  }

  const cleanedBase = normalizeSourceText(baseText);
  const remainingCharacters = MAX_CHARS_FOR_LLM - cleanedBase.length;
  if (remainingCharacters < 400) return { text: cleanedBase, included: 0 };

  const candidates: Array<{
    agendaNumber: string;
    title: string;
    label: string;
    url: string;
    text: string;
  }> = [];

  for (const item of meeting.items) {
    for (const attachment of rankedItemAttachments(item)) {
      const text = cleanText(await extractTextForDocument(attachment));
      if (text.length < MIN_ATTACHMENT_CONTEXT_CHARS) continue;

      attachment.extractedText = text;
      candidates.push({
        agendaNumber: item.agendaNumber || attachment.agendaItemNumber || "Unnumbered",
        title: item.title || attachment.agendaItemTitle || item.rowText,
        label: attachment.label || "Attachment",
        url: attachment.url,
        text
      });
      break;
    }
  }

  if (candidates.length === 0) return { text: cleanedBase, included: 0 };

  let includedCandidates = [...candidates];
  let perItemBudget = 0;
  let headers: string[] = [];

  while (includedCandidates.length > 0) {
    headers = includedCandidates.map(
      (candidate) =>
        `Agenda item ${candidate.agendaNumber} — ${candidate.title}\nLinked document: ${candidate.label}\nSource URL: ${candidate.url}\nExtracted context:`
    );
    const formattingCharacters =
      "Linked agenda-item context:".length +
      headers.reduce((sum, header) => sum + header.length, 0) +
      (includedCandidates.length + 1) * 2;
    perItemBudget = Math.min(
      MAX_ATTACHMENT_CONTEXT_CHARS_PER_ITEM,
      Math.floor((remainingCharacters - formattingCharacters) / includedCandidates.length)
    );
    if (perItemBudget >= MIN_ATTACHMENT_CONTEXT_CHARS) break;
    includedCandidates = includedCandidates.slice(0, -1);
  }

  if (includedCandidates.length === 0) return { text: cleanedBase, included: 0 };

  const blocks = includedCandidates.map(
    (candidate, index) => `${headers[index]}\n${candidate.text.slice(0, perItemBudget)}`
  );
  const text = [cleanedBase, "Linked agenda-item context:", ...blocks].join("\n\n");

  return {
    text: text.slice(0, MAX_CHARS_FOR_LLM),
    included: includedCandidates.length
  };
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
    const text = normalizeSourceText(await candidate.loadText());

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
  const accessibleAgenda = findDoc(meeting, "Accessible Agenda");
  const packetPdf = findDoc(meeting, "Packet") || findDoc(meeting, "Agenda Packet");
  const cancellationPdf = findDoc(meeting, "Notice of Cancellation");
  const specialEventNotice = findDoc(meeting, "Special Event Notice");
  const earlyStaffReports = findDocs(meeting, "Early Staff Report Release");
  const fallbackSourceUrl = sourceUrlFallback(meeting);
  const isMenloParkMeeting = meeting.jurisdictionSlug === "menlo-park";

  let selectedSourceType: string | null = null;
  let selectedSourceUrl: string | null = null;
  let selectedText = "";
  const extractionNotes = [...(meeting.extractionNotes || [])];

  if (isCancelled) {
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
          : "No cancellation document was available; used source row text."
      );
    }

    extractionNotes.push(
      "Cancelled meetings are retained as official records but are not sent for decision-card summarization."
    );
  } else if (isMenloParkMeeting && meeting.status === "Notice" && specialEventNotice) {
    selectedSourceType = "Special Event Notice";
    selectedSourceUrl = specialEventNotice.url || fallbackSourceUrl;

    const noticeText = await extractTextForDocument(specialEventNotice);
    selectedText =
      noticeText ||
      `This Menlo Park row is listed as a special event notice.\n\nSource row:\n${meeting.rowText}`;

    if (!noticeText) {
      extractionNotes.push("Special event notice document had no extractable text; used source row text.");
    }
  } else if (
    isMenloParkMeeting &&
    meeting.status === "Staff Report Release" &&
    earlyStaffReports.length > 0
  ) {
    const primaryStaffReport = earlyStaffReports[0];
    selectedSourceType = "Early Staff Report Release";
    selectedSourceUrl = primaryStaffReport.url || fallbackSourceUrl;

    const staffReportText = await extractTextForDocument(primaryStaffReport);
    selectedText =
      staffReportText ||
      `This Menlo Park row is listed as an early staff report release.\n\nSource row:\n${meeting.rowText}`;

    if (!staffReportText) {
      extractionNotes.push("Early staff report release document had no extractable text; used source row text.");
    }
  } else {
    const candidates: SourceCandidate[] = [];

    const htmlAgendaText = meeting.htmlAgendaText;
    if (
      htmlAgendaText &&
      isUsablePrimeGovHtmlAgendaText(htmlAgendaText) &&
      isUsableOfficialSourceText(htmlAgendaText, MIN_HTML_AGENDA_CHARS)
    ) {
      candidates.push({
        sourceType: "HTML Agenda",
        sourceUrl: htmlAgenda?.url || fallbackSourceUrl,
        minimumCharacters: MIN_HTML_AGENDA_CHARS,
        loadText: () => normalizeSourceText(htmlAgendaText),
        emptyNote: "HTML agenda had little or no usable agenda text."
      });
    } else if (htmlAgendaText) {
      extractionNotes.push(
        "HTML agenda did not contain structured official agenda content; ignored it."
      );
    }

    const addAgendaCandidate = () => {
      if (!agendaPdf?.localPath && !agendaPdf?.extractedText) return;
      candidates.push({
        sourceType: documentSourceType(agendaPdf, "Agenda"),
        sourceUrl: agendaPdf.url,
        minimumCharacters: MIN_PRIMARY_SOURCE_CHARS,
        loadText: () =>
          extractUsableTextForDocument(agendaPdf, MIN_PRIMARY_SOURCE_CHARS),
        emptyNote: "Agenda document had little or no extractable text."
      });
    };

    const addAccessibleAgendaCandidate = () => {
      if (!accessibleAgenda?.localPath && !accessibleAgenda?.extractedText) return;
      candidates.push({
        sourceType: documentSourceType(accessibleAgenda, "Accessible Agenda"),
        sourceUrl: accessibleAgenda.url,
        minimumCharacters: MIN_HTML_AGENDA_CHARS,
        loadText: () =>
          extractUsableTextForDocument(accessibleAgenda, MIN_HTML_AGENDA_CHARS),
        emptyNote: "Accessible agenda had little or no usable agenda text."
      });
    };

    const addPacketCandidate = () => {
      if (!packetPdf?.localPath && !packetPdf?.extractedText) return;
      candidates.push({
        sourceType: documentSourceType(
          packetPdf,
          packetPdf.type === "Agenda Packet" ? "Agenda Packet" : "Packet"
        ),
        sourceUrl: packetPdf.url,
        minimumCharacters: MIN_PRIMARY_SOURCE_CHARS,
        loadText: () =>
          extractUsableTextForDocument(packetPdf, MIN_PRIMARY_SOURCE_CHARS),
        emptyNote: "Packet document had little or no extractable text.",
        selectedNote: isMenloParkMeeting
          ? "Used Menlo Park agenda packet as the primary agenda source."
          : "Used packet document because a higher-priority agenda source was unavailable or unreadable."
      });
    };

    if (isMenloParkMeeting) {
      addPacketCandidate();
      addAgendaCandidate();
      addAccessibleAgendaCandidate();
    } else {
      addAgendaCandidate();
      addAccessibleAgendaCandidate();
    }

    const mountainViewDetailText = meeting.detailText;
    if (meeting.jurisdictionSlug === "mountain-view" && mountainViewDetailText) {
      candidates.push({
        sourceType: "Detail Page",
        sourceUrl: meeting.meetingDetailsUrl || fallbackSourceUrl,
        minimumCharacters: MIN_PRIMARY_SOURCE_CHARS,
        loadText: () => normalizeSourceText(mountainViewDetailText),
        emptyNote: "Detail page had little or no usable agenda text.",
        selectedNote: "Used detail page text because no agenda document text was available."
      });
    }

    if (!isMenloParkMeeting) {
      addPacketCandidate();
    }

    const detailText = meeting.jurisdictionSlug === "mountain-view" ? null : meeting.detailText;
    if (detailText) {
      candidates.push({
        sourceType: "Detail Page",
        sourceUrl: meeting.meetingDetailsUrl || fallbackSourceUrl,
        minimumCharacters: MIN_PRIMARY_SOURCE_CHARS,
        loadText: () => normalizeSourceText(detailText),
        emptyNote: "Detail page had little or no usable agenda text.",
        selectedNote: "Used detail page text because no agenda document text was available."
      });
    }

    if (meeting.rowText) {
      candidates.push({
        sourceType: "Row Text",
        sourceUrl: fallbackSourceUrl,
        minimumCharacters: MIN_ROW_SOURCE_CHARS,
        loadText: () => normalizeSourceText(meeting.rowText),
        emptyNote: "Meeting row text had little or no usable agenda text.",
        selectedNote: "Used source row text because no usable agenda document text was available."
      });
    }

    const selectedSource = await selectFirstUsableSource(candidates, extractionNotes);

    if (selectedSource) {
      selectedSourceType = selectedSource.sourceType;
      selectedSourceUrl = selectedSource.sourceUrl;
      selectedText = selectedSource.text;

      if (isMenloParkMeeting && earlyStaffReports.length > 0) {
        const supplementalTexts: string[] = [];

        for (const doc of earlyStaffReports) {
          if (doc.url === selectedSourceUrl) continue;
          const text = await extractTextForDocument(doc);
          if (text.length < MIN_ROW_SOURCE_CHARS) {
            extractionNotes.push(`${doc.label || doc.type} had little or no extractable text.`);
            continue;
          }
          supplementalTexts.push(`${doc.label || doc.type}:\n${text}`);
        }

        if (supplementalTexts.length > 0) {
          selectedText = [
            selectedText,
            "Supplemental Menlo Park early staff report release text:",
            ...supplementalTexts
          ].join("\n\n");
          extractionNotes.push("Included Menlo Park early staff report release text as supplemental context.");
        }
      }
    } else {
      selectedSourceType = htmlAgenda ? "HTML Agenda" : null;
      selectedSourceUrl =
        htmlAgenda?.url ||
        agendaPdf?.url ||
        accessibleAgenda?.url ||
        packetPdf?.url ||
        cancellationPdf?.url ||
        fallbackSourceUrl;
      extractionNotes.push("No usable HTML agenda, agenda PDF, packet PDF, detail text, or row text was available.");
    }
  }

  const sourceDetectedCancellation = !isCancelled && isCancellationNoticeText(selectedText);
  const effectiveCancelled = isCancelled || sourceDetectedCancellation;
  if (sourceDetectedCancellation) {
    selectedSourceType = "Cancellation";
    meeting.items = [];
    extractionNotes.push(
      "The official document is a cancellation notice; retained the meeting but excluded it from decision-card summarization."
    );
  }

  if (isMenloParkMeeting && !meeting.timeText) {
    enrichMenloParkMeetingTimesFromAgendaText([meeting]);
    for (const note of meeting.extractionNotes || []) {
      if (!extractionNotes.includes(note)) extractionNotes.push(note);
    }
  }

  const authoritativeSourceItemIds = authoritativeAgendaItemSourceIds(meeting);
  const extractedItems = effectiveCancelled || authoritativeSourceItemIds
    ? []
    : extractAgendaItemsFromText(meeting, selectedText);
  if (authoritativeSourceItemIds) {
    extractionNotes.push(
      `Used ${authoritativeSourceItemIds.length} authoritative source agenda item(s); PDF text was retained as evidence but not reparsed into additional items.`
    );
  }
  meeting.items = effectiveCancelled
    ? []
    : mergeAgendaItems(meeting.items || [], extractedItems);

  const attachmentContext = effectiveCancelled
    ? { text: selectedText, included: 0 }
    : await appendAgendaItemAttachmentContext(meeting, selectedText);
  selectedText = attachmentContext.text;
  if (attachmentContext.included > 0) {
    extractionNotes.push(
      `Included item-aware context from ${attachmentContext.included} agenda attachment(s).`
    );
  }

  if (meeting.items.length > 0) {
    const currentSourceContext = currentMeetingSourceText(selectedText).slice(
      0,
      MAX_MEETING_WIDE_CONTEXT_CHARS
    );
    const meetingWideContext = [
      MEETING_WIDE_CONTEXT_HEADING,
      currentSourceContext
    ].join("\n\n");
    const structuredItemBudget = Math.max(
      0,
      MAX_CHARS_FOR_LLM - meetingWideContext.length - 2
    );
    const structuredItemContext = formatAgendaItemContexts(
      meeting.items,
      structuredItemBudget
    );
    selectedText = [meetingWideContext, structuredItemContext].filter(Boolean).join("\n\n");
    extractionNotes.push(
      `Prepared item-specific context for ${meeting.items.length} current agenda item(s) and excluded packet text after the current agenda boundary.`
    );
  }

  return {
    ...meeting,
    id: slugify(`${meetingDateTimeText(meeting) || "no-date"}-${meeting.title}`),
    status: effectiveCancelled
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
    // Cancellation notices are useful meeting metadata, not decisions. Keeping the
    // prepared input empty also protects non-pipeline callers from sending a stale
    // agenda or packet to an LLM after a meeting is cancelled.
    llmInputText: effectiveCancelled ? "" : truncateForLLM(selectedText),
    // Submitted public comments are deliberately excluded from every prompt
    // path (source hash, item context, summary validation, and the user
    // prompt), so extracting them added no card context. They were only ever
    // republished verbatim on the meeting page; the comment packet itself stays
    // linked as an official source document.
    publicCommentsInputText: null
  };
}

export async function prepareLlmInput(meetings: PrimeGovMeeting[]) {
  const llmReadyMeetings: LlmReadyMeeting[] = [];

  for (const meeting of meetings) {
    llmReadyMeetings.push(await buildLlmReadyMeeting(meeting));
  }

  return llmReadyMeetings;
}
