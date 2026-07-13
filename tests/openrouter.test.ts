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

function captureLlmEnv() {
  return {
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openRouterModel: process.env.OPENROUTER_MODEL,
    openRouterMinIntervalMs: process.env.OPENROUTER_MIN_REQUEST_INTERVAL_MS,
    openRouterMaxAttempts: process.env.OPENROUTER_SUMMARY_MAX_ATTEMPTS,
    openRouterRetryBaseMs: process.env.OPENROUTER_SUMMARY_RETRY_BASE_MS,
    openRouterRateLimitRetryBaseMs: process.env.OPENROUTER_RATE_LIMIT_RETRY_BASE_MS,
    cerebrasApiKey: process.env.CEREBRAS_API_KEY,
    cerebrasModel: process.env.CEREBRAS_MODEL,
    cerebrasMinIntervalMs: process.env.CEREBRAS_MIN_REQUEST_INTERVAL_MS
  };
}

function restoreLlmEnv(env: ReturnType<typeof captureLlmEnv>) {
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  };

  restore("OPENROUTER_API_KEY", env.openRouterApiKey);
  restore("OPENROUTER_MODEL", env.openRouterModel);
  restore("OPENROUTER_MIN_REQUEST_INTERVAL_MS", env.openRouterMinIntervalMs);
  restore("OPENROUTER_SUMMARY_MAX_ATTEMPTS", env.openRouterMaxAttempts);
  restore("OPENROUTER_SUMMARY_RETRY_BASE_MS", env.openRouterRetryBaseMs);
  restore("OPENROUTER_RATE_LIMIT_RETRY_BASE_MS", env.openRouterRateLimitRetryBaseMs);
  restore("CEREBRAS_API_KEY", env.cerebrasApiKey);
  restore("CEREBRAS_MODEL", env.cerebrasModel);
  restore("CEREBRAS_MIN_REQUEST_INTERVAL_MS", env.cerebrasMinIntervalMs);
}

function setLlmTestEnv() {
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.OPENROUTER_MODEL = "test-openrouter-model";
  process.env.OPENROUTER_MIN_REQUEST_INTERVAL_MS = "0";
  process.env.OPENROUTER_SUMMARY_MAX_ATTEMPTS = "3";
  process.env.OPENROUTER_SUMMARY_RETRY_BASE_MS = "0";
  process.env.OPENROUTER_RATE_LIMIT_RETRY_BASE_MS = "0";
  delete process.env.CEREBRAS_API_KEY;
  delete process.env.CEREBRAS_MODEL;
  process.env.CEREBRAS_MIN_REQUEST_INTERVAL_MS = "0";
}

test("regenerates when validation drops source-unsupported cards", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  let calls = 0;
  let secondPrompt = "";

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
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
  const originalEnv = captureLlmEnv();
  let calls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
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

test("falls back to Cerebras when OpenRouter is rate-limited", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  const urls: string[] = [];
  const models: string[] = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  process.env.CEREBRAS_API_KEY = "test-cerebras-key";
  process.env.CEREBRAS_MODEL = "gpt-oss-120b";

  globalThis.fetch = (async (url, init) => {
    urls.push(String(url));
    const body = JSON.parse(String(init?.body || "{}")) as { model?: string };
    models.push(body.model || "");

    if (String(url).includes("openrouter.ai")) {
      return new Response("temporarily rate-limited upstream", { status: 429 });
    }

    return openRouterResponse({
      meetingSummary,
      cards: [card()]
    });
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(meeting());

  assert.deepEqual(urls, [
    "https://openrouter.ai/api/v1/chat/completions",
    "https://api.cerebras.ai/v1/chat/completions"
  ]);
  assert.deepEqual(models, ["test-openrouter-model", "gpt-oss-120b"]);
  assert.equal(result.summary.cards.length, 1);
});

test("backs off and retries when all configured providers are rate-limited", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  let calls = 0;
  const sleepDelays: number[] = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  process.env.OPENROUTER_SUMMARY_MAX_ATTEMPTS = "2";
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("slow down", {
        status: 429,
        headers: {
          "Retry-After": "2"
        }
      });
    }

    return openRouterResponse({
      meetingSummary,
      cards: [card()]
    });
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(meeting(), {
    sleep: async (ms) => {
      sleepDelays.push(ms);
    }
  });

  assert.equal(calls, 2);
  assert.deepEqual(sleepDelays, [2000]);
  assert.equal(result.summary.cards.length, 1);
});

test("verifies topics and status using only matched agenda-item context", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  let calls = 0;
  let topicPrompt = "";

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  const preparedMeeting = meeting();
  preparedMeeting.llmInputText += " FLAT_PACKET_SENTINEL unrelated police material.";
  preparedMeeting.items = [
    {
      externalId: "item-4",
      fileNumber: null,
      agendaNumber: "4",
      itemType: null,
      title: "Item 4 - Contract approval",
      action: "Approve the park maintenance contract.",
      result: null,
      sourceUrl: "https://city.example/agendas/4",
      rowText: "The contract provides maintenance for city parks and recreation spaces."
    }
  ];

  globalThis.fetch = (async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body || "{}")) as {
      messages?: Array<{ role?: string; content?: string }>;
    };

    if (calls === 1) {
      return openRouterResponse({
        meetingSummary,
        cards: [card({ categoryTags: ["Public Safety"], status: "Under discussion" })]
      });
    }

    topicPrompt = body.messages?.find((message) => message.role === "user")?.content || "";
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                cards: [
                  {
                    cardIndex: 0,
                    categoryTags: ["Parks & Environment"],
                    status: "Upcoming vote"
                  }
                ]
              })
            }
          }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(preparedMeeting);

  assert.equal(calls, 2);
  assert.deepEqual(result.summary.cards[0].categoryTags, ["Parks & Environment"]);
  assert.equal(result.summary.cards[0].status, "Upcoming vote");
  assert.match(topicPrompt, /maintenance for city parks and recreation spaces/);
  assert.doesNotMatch(topicPrompt, /FLAT_PACKET_SENTINEL/);
});

test("falls back to Cerebras when isolated topic and status verification is rate-limited", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  const urls: string[] = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  process.env.CEREBRAS_API_KEY = "test-cerebras-key";
  process.env.CEREBRAS_MODEL = "gpt-oss-120b";
  const preparedMeeting = meeting();
  preparedMeeting.items = [
    {
      externalId: "item-4",
      fileNumber: null,
      agendaNumber: "4",
      itemType: null,
      title: "Item 4 - Contract approval",
      action: "Approve the park maintenance contract.",
      result: null,
      sourceUrl: "https://city.example/agendas/4",
      rowText: "The contract provides maintenance for city parks."
    }
  ];

  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    if (urls.length === 1) {
      return openRouterResponse({ meetingSummary, cards: [card()] });
    }
    if (String(url).includes("openrouter.ai")) {
      return new Response("topic verifier rate limited", { status: 429 });
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                cards: [
                  {
                    cardIndex: 0,
                    categoryTags: ["Parks & Environment"],
                    status: "Upcoming vote"
                  }
                ]
              })
            }
          }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(preparedMeeting);

  assert.deepEqual(urls, [
    "https://openrouter.ai/api/v1/chat/completions",
    "https://openrouter.ai/api/v1/chat/completions",
    "https://api.cerebras.ai/v1/chat/completions"
  ]);
  assert.deepEqual(result.summary.cards[0].categoryTags, ["Parks & Environment"]);
});
