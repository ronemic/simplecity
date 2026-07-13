import assert from "node:assert/strict";
import test from "node:test";
import {
  TOPIC_VALIDATION_SYSTEM_PROMPT,
  applyTopicValidation,
  buildTopicValidationPrompt,
  parseTopicValidation,
  topicValidationCandidates
} from "@/lib/llm/topicValidation";
import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";

const meeting: LlmReadyMeeting = {
  id: "meeting-1",
  externalId: "meeting-1",
  section: "Upcoming Meetings",
  title: "Commission Meeting",
  dateText: "July 15, 2026",
  meetingType: "Commission",
  rowText: "",
  status: "Upcoming",
  sourceType: "Agenda Packet",
  sourceUrl: "https://city.example/agenda",
  hasHtmlAgenda: false,
  hasPdf: true,
  documents: [],
  extractionNotes: [],
  llmInputText: "FLAT_PACKET_SENTINEL unrelated police report",
  publicCommentsInputText: null,
  items: [
    {
      externalId: "item-5-1",
      fileNumber: null,
      agendaNumber: "5.1",
      itemType: "Special Presentations",
      title: "Canopy informational presentation",
      action: "Receive a presentation from Canopy.",
      result: null,
      sourceUrl: "https://city.example/agenda",
      rowText: "Linked staff report context: Canopy provides tree and urban forestry services."
    },
    {
      externalId: "item-6-1",
      fileNumber: null,
      agendaNumber: "6.1",
      itemType: null,
      title: "Police staffing report",
      action: "Receive the report.",
      result: null,
      sourceUrl: "https://city.example/agenda",
      rowText: "An unrelated public safety item."
    }
  ]
};

const summary: SimpleCitySummary = {
  meetingSummary: {
    title: "Commission Meeting",
    date: "July 15, 2026",
    status: "Upcoming",
    oneSentenceSummary: "A regular meeting."
  },
  cards: [
    {
      agendaItem: "Receive Canopy informational presentation",
      whatIsHappening: "Canopy will present its work.",
      whyItMatters: "The work affects local trees.",
      whoItAffects: ["residents"],
      categoryTags: ["Public Safety"],
      status: "Upcoming vote",
      commentWindow: { opens: "Not listed.", closes: "Not listed." },
      howToAct: { attend: "Attend.", email: "Not listed.", submitComment: "Not listed." },
      source: "https://city.example/agenda",
      confidence: "high"
    }
  ],
  translations: {
    es: {
      cards: [
        {
          agendaItem: "Presentación informativa de Canopy",
          whatIsHappening: "Canopy presentará su trabajo.",
          whyItMatters: "El trabajo afecta a los árboles locales.",
          whoItAffects: ["residentes"],
          status: "Upcoming vote",
          commentWindow: { opens: "No indicado.", closes: "No indicado." },
          howToAct: { attend: "Asista.", email: "No indicado.", submitComment: "No indicado." }
        }
      ]
    }
  }
};

test("builds topic verification from only the matched agenda-item context", () => {
  const candidates = topicValidationCandidates(meeting, summary);
  const prompt = buildTopicValidationPrompt(candidates);

  assert.equal(candidates.length, 1);
  assert.match(prompt, /Canopy provides tree and urban forestry services/);
  assert.match(prompt, /Agenda section: Special Presentations/);
  assert.doesNotMatch(prompt, /FLAT_PACKET_SENTINEL/);
  assert.doesNotMatch(prompt, /Police staffing report/);
  assert.doesNotMatch(prompt, /Currently selected topics/);
  assert.doesNotMatch(prompt, /Current card status/);
});

test("applies one or two verified topics and requires every matched card", () => {
  const candidates = topicValidationCandidates(meeting, summary);
  const verified = parseTopicValidation(
    JSON.stringify({
      cards: [
        {
          cardIndex: 0,
          categoryTags: ["Parks & Environment"],
          status: "Information only"
        }
      ]
    }),
    candidates
  );
  const corrected = applyTopicValidation(summary, verified);

  assert.deepEqual(corrected.cards[0].categoryTags, ["Parks & Environment"]);
  assert.equal(corrected.cards[0].status, "Information only");
  assert.equal(corrected.translations?.es?.cards[0]?.status, "Information only");
  assert.throws(
    () => parseTopicValidation(JSON.stringify({ cards: [] }), candidates),
    /every matched card exactly once/
  );
});

test("rejects historical outcome statuses for upcoming item verification", () => {
  const candidates = topicValidationCandidates(meeting, summary);
  assert.throws(
    () =>
      parseTopicValidation(
        JSON.stringify({
          cards: [
            {
              cardIndex: 0,
              categoryTags: ["Parks & Environment"],
              status: "Passed"
            }
          ]
        }),
        candidates
      ),
    /historical outcome/
  );
});

test("topic verifier evaluates complete recommendations and service-specific work plans", () => {
  assert.match(TOPIC_VALIDATION_SYSTEM_PROMPT, /Consider every action requested of the current body/);
  assert.match(TOPIC_VALIDATION_SYSTEM_PROMPT, /a possible formal decision outranks discussion/);
  assert.match(TOPIC_VALIDATION_SYSTEM_PROMPT, /consider adoption/);
  assert.match(TOPIC_VALIDATION_SYSTEM_PROMPT, /Classify a work plan by the substantive service area/);
  assert.match(TOPIC_VALIDATION_SYSTEM_PROMPT, /service charge, revenue, or tax-roll collection/);
  assert.match(TOPIC_VALIDATION_SYSTEM_PROMPT, /Use Routine approval only for approval of meeting minutes/);
  assert.match(TOPIC_VALIDATION_SYSTEM_PROMPT, /Do not use it for a substantive contract, budget, permit/);
});

test("accepts routine approval for minutes while keeping substantive approvals as upcoming votes", () => {
  const minutesMeeting: LlmReadyMeeting = {
    ...meeting,
    items: [
      {
        externalId: "item-3-1",
        fileNumber: null,
        agendaNumber: "3.1",
        itemType: "Approval of Minutes",
        title: "Planning Commission meeting minutes",
        action: "Approve the minutes as presented.",
        result: null,
        sourceUrl: "https://city.example/agenda",
        rowText: "Approval of the April 27 and May 11 meeting minutes."
      },
      {
        externalId: "item-4-1",
        fileNumber: null,
        agendaNumber: "4.1",
        itemType: "Consent Calendar",
        title: "Park maintenance contract",
        action: "Award the park maintenance contract.",
        result: null,
        sourceUrl: "https://city.example/agenda",
        rowText: "Award a substantive maintenance contract for city parks."
      }
    ]
  };
  const minutesAndContract: SimpleCitySummary = {
    ...summary,
    cards: [
      {
        ...summary.cards[0],
        agendaItem: "Approve Planning Commission meeting minutes",
        whatIsHappening: "The commission will approve its prior meeting minutes.",
        categoryTags: ["City Services"]
      },
      {
        ...summary.cards[0],
        agendaItem: "Award park maintenance contract",
        whatIsHappening: "The commission will award a park maintenance contract.",
        categoryTags: ["Parks & Environment"]
      }
    ]
  };
  const candidates = topicValidationCandidates(minutesMeeting, minutesAndContract);
  const prompt = buildTopicValidationPrompt(candidates);
  const verified = parseTopicValidation(
    JSON.stringify({
      cards: [
        { cardIndex: 0, categoryTags: ["City Services"], status: "Routine approval" },
        { cardIndex: 1, categoryTags: ["Parks & Environment"], status: "Upcoming vote" }
      ]
    }),
    candidates
  );

  assert.equal(candidates.length, 2);
  assert.match(prompt, /Agenda section: Approval of Minutes/);
  assert.match(prompt, /Approve the minutes as presented/);
  assert.match(prompt, /Agenda section: Consent Calendar/);
  assert.deepEqual(verified.map((card) => card.status), ["Routine approval", "Upcoming vote"]);
});
