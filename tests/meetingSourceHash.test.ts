import assert from "node:assert/strict";
import test from "node:test";
import {
  meetingSourceHash,
  SIMPLECITY_SUMMARIZER_VERSION
} from "@/lib/db/meetingSourceHash";
import type { LlmReadyMeeting } from "@/lib/types";

function meeting(): LlmReadyMeeting {
  return {
    id: "meeting-hash",
    section: "Upcoming Meetings",
    title: "Council Meeting",
    dateText: "June 13, 2026",
    meetingType: "City Council",
    rowText: "",
    status: "Upcoming",
    sourceType: "Agenda PDF",
    sourceUrl: "https://city.example/agenda",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [
      {
        type: "Agenda",
        label: "Agenda",
        url: "https://city.example/agenda.pdf",
        extractedText: "Official agenda content"
      },
      {
        type: "Public Comments",
        label: "Submitted comments",
        url: "https://city.example/comments.pdf",
        extractedText: "A submitted comment body"
      }
    ],
    extractionNotes: [],
    llmInputText: "Official agenda item text.",
    publicCommentsInputText: "A submitted comment body",
    items: [
      {
        externalId: "item-4",
        fileNumber: "24-100",
        agendaNumber: "4",
        itemType: "Business",
        title: "Park maintenance contract",
        action: "Approve a $100 contract.",
        result: null,
        sourceUrl: "https://city.example/agenda",
        rowText: "The contract covers park maintenance.",
        attachments: [
          {
            type: "Contract",
            label: "Draft contract",
            url: "https://city.example/contract.pdf",
            extractedText: "Contract term is one year."
          }
        ]
      }
    ]
  };
}

test("source hash includes structured item and attachment content", () => {
  const original = meeting();
  const changedAction = meeting();
  changedAction.items![0].action = "Reject the $100 contract.";
  const changedAttachment = meeting();
  changedAttachment.items![0].attachments![0].extractedText =
    "Contract term is two years.";

  assert.notEqual(meetingSourceHash(original), meetingSourceHash(changedAction));
  assert.notEqual(meetingSourceHash(original), meetingSourceHash(changedAttachment));
  assert.match(SIMPLECITY_SUMMARIZER_VERSION, /item-scoped/);
});

test("source hash excludes public-comment bodies and local storage paths", () => {
  const original = meeting();
  const commentsChanged = meeting();
  commentsChanged.publicCommentsInputText = "A completely different submitted comment.";
  commentsChanged.documents[1] = {
    ...commentsChanged.documents[1],
    bytes: 99_999,
    extractionCharacterCount: 5_000,
    extractedText: "A completely different submitted comment."
  };
  commentsChanged.documents[0].localPath = "/tmp/other-agenda.pdf";
  commentsChanged.items![0].attachments![0].storagePath = "other/contract.pdf";

  assert.equal(meetingSourceHash(original), meetingSourceHash(commentsChanged));
});
