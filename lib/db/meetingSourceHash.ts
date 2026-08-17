import crypto from "node:crypto";
import type { LlmReadyMeeting, PrimeGovDocument } from "@/lib/types";
import { MEETING_WIDE_CONTEXT_HEADING } from "@/lib/scraper/agendaItemContext";

export const SIMPLECITY_SUMMARIZER_VERSION =
  "item-scoped-no-public-comments-v3-status-independent";
const PREVIOUS_SUMMARIZER_VERSION = "item-scoped-no-public-comments-v2";
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

/**
 * Reproduce the source hash written before the item-scoped hash was introduced.
 *
 * This is intentionally kept separate from the current hash. A stored legacy
 * hash is only considered compatible when the current scrape still produces
 * exactly the source shape that the old algorithm hashed. That lets us migrate
 * unchanged rows without treating an algorithm/version bump as an official
 * source change, while real text, metadata, or document changes still miss the
 * compatibility check and get summarized again.
 */
export function legacyMeetingSourceHashV1(meeting: LlmReadyMeeting) {
  const source = {
    ...(meeting.llmInputText.includes(MEETING_WIDE_CONTEXT_HEADING)
      ? { summaryInputVersion: "meeting-wide-participation-v1" }
      : {}),
    title: meeting.title,
    meetingType: meeting.meetingType,
    dateText: meeting.dateText,
    timeText: meeting.timeText,
    location: meeting.location,
    status: meeting.status,
    sourceType: meeting.sourceType,
    sourceUrl: meeting.sourceUrl,
    llmInputText: meeting.llmInputText,
    publicCommentsInputText: meeting.publicCommentsInputText,
    documents: meeting.documents
      .map((doc) => ({
        type: doc.type,
        label: doc.label,
        url: doc.url,
        bytes: doc.bytes || null,
        extractionCharacterCount: doc.extractionCharacterCount || null,
        isScanned: Boolean(doc.isScanned)
      }))
      .sort((left, right) => left.url.localeCompare(right.url))
  };

  return crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

export function compatibleLegacyMeetingSourceHashes(meeting: LlmReadyMeeting) {
  const transitionStatuses = meeting.status === "Cancelled"
    ? [meeting.status]
    : [meeting.status, "Upcoming", "Past", "Unknown"];
  const uniqueStatuses = [...new Set(transitionStatuses)];
  return [
    ...uniqueStatuses.map((status) =>
      legacyMeetingSourceHashV1({ ...meeting, status } as LlmReadyMeeting)
    ),
    ...uniqueStatuses.map((status) =>
      previousMeetingSourceHashV2(meeting, status)
    )
  ];
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
    sourceType: meeting.sourceType,
    sourceUrl: meeting.sourceUrl,
    llmInputText: meeting.llmInputText,
    documents: stableDocumentShape(meeting),
    items: stableAgendaItemShape(meeting)
  };

  return crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

function previousMeetingSourceHashV2(
  meeting: LlmReadyMeeting,
  status: LlmReadyMeeting["status"] | string
) {
  const source = {
    summarizerVersion: PREVIOUS_SUMMARIZER_VERSION,
    title: meeting.title,
    meetingType: meeting.meetingType,
    dateText: meeting.dateText,
    timeText: meeting.timeText,
    location: meeting.location,
    status,
    sourceType: meeting.sourceType,
    sourceUrl: meeting.sourceUrl,
    llmInputText: meeting.llmInputText,
    documents: stableDocumentShape(meeting),
    items: stableAgendaItemShape(meeting)
  };

  return crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex");
}
