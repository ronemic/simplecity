import assert from "node:assert/strict";
import test from "node:test";
import type { AgendaItem, LlmReadyMeeting } from "@/lib/types";
import {
  validationOptionsForMeeting,
  validateSimpleCitySummary
} from "@/lib/llm/validateSummary";
import { cardStatusForOfficialItem } from "@/lib/utils/officialItemStatus";

function agendaItem(overrides: Partial<AgendaItem> & { externalId: string }): AgendaItem {
  return {
    fileNumber: null,
    agendaNumber: "1",
    itemType: null,
    title: "An agenda item",
    action: null,
    result: null,
    sourceUrl: "https://example.gov/item",
    rowText: overrides.title ?? "An agenda item",
    recommendedAction: null,
    status: null,
    ...overrides
  } as AgendaItem;
}

function meetingWith(items: AgendaItem[], status: LlmReadyMeeting["status"]): LlmReadyMeeting {
  return {
    section: "Past Meetings",
    title: "Board of Supervisors Regular Meeting",
    dateText: "June 22, 2026",
    meetingType: "Regular Meeting",
    rowText: "Board of Supervisors Regular Meeting",
    status,
    sourceUrl: "https://example.gov/meeting",
    hasHtmlAgenda: false,
    hasPdf: false,
    documents: [],
    items,
    extractionNotes: [],
    llmInputText: "Current agenda and meeting-wide participation context:\n\nAttend in person.",
    id: "meeting-1"
  } as unknown as LlmReadyMeeting;
}

function cardPayload(status: string, sourceItemId: string, agendaItemTitle: string) {
  return {
    meetingSummary: {
      title: "Board of Supervisors Regular Meeting",
      date: "June 22, 2026",
      status: "Past",
      oneSentenceSummary: "The Board met."
    },
    cards: [
      {
        sourceItemId,
        agendaItem: agendaItemTitle,
        whatIsHappening: ["The Board will approve the framework."],
        whyItMatters: "It affects residents.",
        whoItAffects: ["Residents"],
        categoryTags: ["Housing"],
        status,
        commentWindow: { opens: "Not listed in the source document.", closes: "Not listed in the source document." },
        howToAct: {
          attend: "Not listed in the source document.",
          email: "Not listed in the source document.",
          submitComment: "Not listed in the source document."
        },
        source: "https://example.gov/meeting",
        confidence: "medium"
      }
    ]
  };
}

test("a withdrawn item cannot be published as an upcoming vote", () => {
  // Real shape from san-mateo-county: Legistar records the item as withdrawn.
  const items = [
    agendaItem({
      externalId: "item-1",
      title: "Approve framework for granting Horizon Treatment Services control of the County-owned site",
      recommendedAction: "withdrawn"
    })
  ];
  const issues: string[] = [];
  const options = validationOptionsForMeeting(meetingWith(items, "Past"), (issue) =>
    issues.push(issue.reason)
  );
  const result = validateSimpleCitySummary(
    cardPayload("Upcoming vote", "item-1", "Approve framework for granting Horizon Treatment Services control of the County-owned site"),
    options
  );

  assert.equal(result.cards.length, 0);
  assert.ok(issues.some((reason) => /withdrawn/i.test(reason)), issues.join(" | "));
});

test("an item with a recorded result cannot be published as still pending", () => {
  const items = [
    agendaItem({
      externalId: "item-2",
      title: "Motion approving the reappointment of Azalina Eusope to the Sanitation and Streets Commission",
      result: "Passed"
    })
  ];
  const issues: string[] = [];
  const options = validationOptionsForMeeting(meetingWith(items, "Past"), (issue) =>
    issues.push(issue.reason)
  );
  const result = validateSimpleCitySummary(
    cardPayload("Under discussion", "item-2", "Motion approving the reappointment of Azalina Eusope to the Sanitation and Streets Commission"),
    options
  );

  assert.equal(result.cards.length, 0);
  assert.ok(issues.some((reason) => /recorded result/i.test(reason)), issues.join(" | "));
});

test("an item still awaiting action keeps its pending status", () => {
  const items = [
    agendaItem({
      externalId: "item-3",
      title: "Approve framework for granting Horizon Treatment Services control of the County-owned site",
      recommendedAction: "Approve the framework and direct staff to return with documents"
    })
  ];
  const options = validationOptionsForMeeting(meetingWith(items, "Upcoming"), () => {});
  const result = validateSimpleCitySummary(
    cardPayload("Upcoming vote", "item-3", "Approve framework for granting Horizon Treatment Services control of the County-owned site"),
    options
  );

  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].status, "Upcoming vote");
});

test("approving a withdrawal of funds is not treated as a withdrawn item", () => {
  const items = [
    agendaItem({
      externalId: "item-4",
      title: "Approve the withdrawal of $2,000,000 from the Capital Reserve Fund",
      recommendedAction: "Approve the withdrawal of $2,000,000 from the Capital Reserve Fund"
    })
  ];
  const options = validationOptionsForMeeting(meetingWith(items, "Upcoming"), () => {});
  const result = validateSimpleCitySummary(
    cardPayload("Upcoming vote", "item-4", "Approve the withdrawal of $2,000,000 from the Capital Reserve Fund"),
    options
  );

  assert.equal(result.cards.length, 1);
});


test("the official-source fallback card cannot claim a pending status either", () => {
  // The fallback path bypasses card validation, so it needs the same rule.
  assert.equal(cardStatusForOfficialItem({ action: "withdrawn", result: "Pass" }), "Cancelled");
  assert.equal(cardStatusForOfficialItem({ action: null, result: "Passed" }), "Passed");
  assert.equal(cardStatusForOfficialItem({ action: null, result: "Continued to August 4" }), "Tabled");
  assert.equal(cardStatusForOfficialItem({ action: null, result: "Failed" }), "Information only");
  assert.equal(cardStatusForOfficialItem({ action: null, result: "No action taken" }), "Information only");
  // Nothing decided yet leaves the pending statuses alone.
  assert.equal(cardStatusForOfficialItem({ action: "Approve the contract", result: null }), null);
  // And an item whose subject matter is a withdrawal is not a withdrawn item.
  assert.equal(
    cardStatusForOfficialItem({
      action: "Approve the withdrawal of $2,000,000 from the Capital Reserve Fund",
      result: null
    }),
    null
  );
});
