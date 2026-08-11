import crypto from "node:crypto";
import type { LlmReadyMeeting, PrimeGovDocument } from "@/lib/types";

export const SIMPLECITY_SUMMARIZER_VERSION = "item-scoped-no-public-comments-v2";
const PUBLIC_COMMENT_DOCUMENT_TYPES = new Set(["Public Comment", "Public Comments"]);

function contentHash(value?: string | null) {
  return value
    ? crypto.createHash("sha256").update(value).digest("hex")
    : null;
}

function stableDocuments(documents: PrimeGovDocument[]) {
  return documents
    .filter((doc) => !PUBLIC_COMMENT_DOCUMENT_TYPES.has(doc.type))
    .map((doc) => ({
      type: doc.type,
      label: doc.label,
      url: doc.url,
      bytes: doc.bytes || null,
      extractionCharacterCount: doc.extractionCharacterCount || null,
      isScanned: Boolean(doc.isScanned),
      extractedTextHash: contentHash(doc.extractedText)
    }))
    .sort((left, right) => left.url.localeCompare(right.url));
}

function stableDocumentShape(meeting: LlmReadyMeeting) {
  return stableDocuments(meeting.documents);
}

function stableAgendaItemShape(meeting: LlmReadyMeeting) {
  return (meeting.items || [])
    .map((item) => ({
      externalId: item.externalId,
      fileNumber: item.fileNumber,
      agendaNumber: item.agendaNumber,
      itemType: item.itemType,
      title: item.title,
      action: item.action,
      result: item.result,
      status: item.status || null,
      meetingBody: item.meetingBody || null,
      onAgenda: item.onAgenda || null,
      recommendedAction: item.recommendedAction || null,
      sourceUrl: item.sourceUrl,
      rowTextHash: contentHash(item.rowText),
      legislationTextHash: contentHash(item.legislationText),
      attachments: stableDocuments(item.attachments || [])
    }))
    .sort((left, right) =>
      `${left.externalId}\n${left.agendaNumber || ""}\n${left.title || ""}`.localeCompare(
        `${right.externalId}\n${right.agendaNumber || ""}\n${right.title || ""}`
      )
    );
}

export function meetingSourceHash(meeting: LlmReadyMeeting) {
  const source = {
    summarizerVersion: SIMPLECITY_SUMMARIZER_VERSION,
    title: meeting.title,
    meetingType: meeting.meetingType,
    dateText: meeting.dateText,
    timeText: meeting.timeText,
    location: meeting.location,
    status: meeting.status,
    sourceType: meeting.sourceType,
    sourceUrl: meeting.sourceUrl,
    llmInputText: meeting.llmInputText,
    documents: stableDocumentShape(meeting),
    items: stableAgendaItemShape(meeting)
  };

  return crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex");
}
