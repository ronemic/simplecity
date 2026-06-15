import assert from "node:assert/strict";
import test from "node:test";
import { generateSummaryForMeeting } from "@/lib/llm/openrouter";
import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";

const meetingSummary = {
  title: "Council Meeting",
  date: "June 13, 2026",
  status: "Upcoming",
  oneSentenceSummary: "A regular meeting."
};

function card(overrides: Partial<SimpleCitySummary["cards"][number]> = {}) {
  return {
    agendaItem: "Item 4 - Contract approval",
    whatIsHappening: "The council will consider a $100 contract for park maintenance.",
    whyItMatters: "The contract affects park maintenance work.",
    whoItAffects: ["park users"],
    categoryTags: ["Parks & Environment"],
    status: "Upcoming vote",
    commentWindow: {
      opens: "Not listed in the source document.",
      closes: "Not listed in the source document."
    },
    howToAct: {
      attend: "Attend the meeting at 7:00 PM.",
      email: "Not listed in the source document.",
      submitComment: "Not listed in the source document."
    },
    source: "https://city.example/agendas/4",
    confidence: "high",
    ...overrides
  } satisfies SimpleCitySummary["cards"][number];
}

function meeting(): LlmReadyMeeting {
  return {
    id: "council-meeting",
    section: "Upcoming Meetings",
    title: "Council Meeting",
    dateText: "June 13, 2026",
    timeText: "7:00 PM",
    meetingType: "City Council",
    rowText: "",
    status: "Upcoming",
    sourceType: "Agenda PDF",
    sourceUrl: "https://city.example/agendas/4",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [],
    extractionNotes: [],
    llmInputText: (
      "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM for park maintenance. "
    ).repeat(8),
    publicCommentsInputText: null
  };
}

function openRouterResponse(summary: SimpleCitySummary) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify(summary)
          }
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

test("regenerates when validation drops source-unsupported cards", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_MODEL;
  let calls = 0;
  let secondPrompt = "";

  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalApiKey;
    process.env.OPENROUTER_MODEL = originalModel;
  });

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "test-model";
  globalThis.fetch = (async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body || "{}")) as {
      messages?: Array<{ content?: string }>;
    };

    if (calls === 2) {
      secondPrompt = body.messages?.at(-1)?.content || "";
    }

    const firstSummary: SimpleCitySummary = {
      meetingSummary,
      cards: [
        card({
          whatIsHappening: "The council will consider a $250 contract for park maintenance."
        })
      ]
    };
    const fixedSummary: SimpleCitySummary = {
      meetingSummary,
      cards: [card()]
    };

    return openRouterResponse(calls === 1 ? firstSummary : fixedSummary);
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(meeting());

  assert.equal(calls, 2);
  assert.match(secondPrompt, /previous response could not be fully used/i);
  assert.equal(result.summary.cards.length, 1);
  assert.equal(result.summary.cards[0].whatIsHappening, "The council will consider a $100 contract for park maintenance.");
});

test("regenerates an empty summary when agenda source text is usable", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_MODEL;
  let calls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalApiKey;
    process.env.OPENROUTER_MODEL = originalModel;
  });

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "test-model";
  globalThis.fetch = (async () => {
    calls += 1;

    const emptySummary: SimpleCitySummary = {
      meetingSummary,
      cards: []
    };
    const fixedSummary: SimpleCitySummary = {
      meetingSummary,
      cards: [card()]
    };

    return openRouterResponse(calls === 1 ? emptySummary : fixedSummary);
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(meeting());

  assert.equal(calls, 2);
  assert.equal(result.summary.cards.length, 1);
});
