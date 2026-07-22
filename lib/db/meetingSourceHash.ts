import crypto from "node:crypto";
import type { LlmReadyMeeting } from "@/lib/types";
import { MEETING_WIDE_CONTEXT_HEADING } from "@/lib/scraper/agendaItemContext";

function stableDocumentShape(meeting: LlmReadyMeeting) {
  return meeting.documents
    .map((doc) => ({
      type: doc.type,
      label: doc.label,
      url: doc.url,
      bytes: doc.bytes || null,
      extractionCharacterCount: doc.extractionCharacterCount || null,
      isScanned: Boolean(doc.isScanned)
    }))
    .sort((left, right) => left.url.localeCompare(right.url));
}

export function meetingSourceHash(meeting: LlmReadyMeeting) {
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
    documents: stableDocumentShape(meeting)
  };

  return crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex");
}
