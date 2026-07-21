import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgendaItemSummaryBatches,
  generateSummaryForMeeting,
  MAX_AGENDA_ITEM_BATCH_CHARS
} from "@/lib/llm/openrouter";
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
    whatIsHappening: ["The council will consider a $100 contract for park maintenance."],
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
    openRouterApiKey2: process.env.OPENROUTER_API_KEY_2,
    openRouterApiKey3: process.env.OPENROUTER_API_KEY_3,
    openRouterModel: process.env.OPENROUTER_MODEL,
    openRouterMinIntervalMs: process.env.OPENROUTER_MIN_REQUEST_INTERVAL_MS,
    openRouterMaxAttempts: process.env.OPENROUTER_SUMMARY_MAX_ATTEMPTS,
    openRouterRetryBaseMs: process.env.OPENROUTER_SUMMARY_RETRY_BASE_MS,
    openRouterRateLimitRetryBaseMs: process.env.OPENROUTER_RATE_LIMIT_RETRY_BASE_MS,
    llmMaxRetryDelayMs: process.env.LLM_MAX_RETRY_DELAY_MS,
    cerebrasApiKey: process.env.CEREBRAS_API_KEY,
    cerebrasApiKey2: process.env.CEREBRAS_API_KEY_2,
    cerebrasApiKey3: process.env.CEREBRAS_API_KEY_3,
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
  restore("OPENROUTER_API_KEY_2", env.openRouterApiKey2);
  restore("OPENROUTER_API_KEY_3", env.openRouterApiKey3);
  restore("OPENROUTER_MODEL", env.openRouterModel);
  restore("OPENROUTER_MIN_REQUEST_INTERVAL_MS", env.openRouterMinIntervalMs);
  restore("OPENROUTER_SUMMARY_MAX_ATTEMPTS", env.openRouterMaxAttempts);
  restore("OPENROUTER_SUMMARY_RETRY_BASE_MS", env.openRouterRetryBaseMs);
  restore("OPENROUTER_RATE_LIMIT_RETRY_BASE_MS", env.openRouterRateLimitRetryBaseMs);
  restore("LLM_MAX_RETRY_DELAY_MS", env.llmMaxRetryDelayMs);
  restore("CEREBRAS_API_KEY", env.cerebrasApiKey);
  restore("CEREBRAS_API_KEY_2", env.cerebrasApiKey2);
  restore("CEREBRAS_API_KEY_3", env.cerebrasApiKey3);
  restore("CEREBRAS_MODEL", env.cerebrasModel);
  restore("CEREBRAS_MIN_REQUEST_INTERVAL_MS", env.cerebrasMinIntervalMs);
}

function setLlmTestEnv() {
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  delete process.env.OPENROUTER_API_KEY_2;
  delete process.env.OPENROUTER_API_KEY_3;
  process.env.OPENROUTER_MODEL = "test-openrouter-model";
  process.env.OPENROUTER_MIN_REQUEST_INTERVAL_MS = "0";
  process.env.OPENROUTER_SUMMARY_MAX_ATTEMPTS = "3";
  process.env.OPENROUTER_SUMMARY_RETRY_BASE_MS = "0";
  process.env.OPENROUTER_RATE_LIMIT_RETRY_BASE_MS = "0";
  delete process.env.CEREBRAS_API_KEY;
  delete process.env.CEREBRAS_API_KEY_2;
  delete process.env.CEREBRAS_API_KEY_3;
  delete process.env.CEREBRAS_MODEL;
  process.env.CEREBRAS_MIN_REQUEST_INTERVAL_MS = "0";
}

test("repairs only source-unsupported cards without regenerating the meeting", async (t) => {
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
          whatIsHappening: ["The council will consider a $250 contract for park maintenance."]
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
  assert.match(secondPrompt, /repair only the rejected simplecity cards/i);
  assert.doesNotMatch(secondPrompt, /include every non-routine/i);
  assert.equal(result.summary.cards.length, 1);
  assert.deepEqual(result.summary.cards[0].whatIsHappening, [
    "The council will consider a $100 contract for park maintenance."
  ]);
});

test("rejects a failed targeted repair without regenerating the meeting", async (t) => {
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
    return openRouterResponse({
      meetingSummary,
      cards: [
        card({
          whatIsHappening: ["The council will consider a $250 contract for park maintenance."]
        })
      ]
    });
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(meeting());

  assert.equal(calls, 2);
  assert.equal(result.summary.cards.length, 0);
});

test("repairs only a card containing degenerate model text", async (t) => {
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
    if (calls === 2) secondPrompt = body.messages?.at(-1)?.content || "";

    return openRouterResponse({
      meetingSummary,
      cards: [
        card({
          agendaItem:
            calls === 1
              ? "Approve meeting minutes {{{{{{{{{{{{"
              : "Item 4 - Contract approval"
        })
      ]
    });
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(meeting());

  assert.equal(calls, 2);
  assert.match(secondPrompt, /malformed generated text/i);
  assert.match(secondPrompt, /repair only the rejected simplecity cards/i);
  assert.equal(result.summary.cards[0]?.agendaItem, "Item 4 - Contract approval");
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

test("falls back to OpenRouter when Cerebras is rate-limited", async (t) => {
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

    if (String(url).includes("cerebras.ai")) {
      return new Response("temporarily rate-limited upstream", { status: 429 });
    }

    return openRouterResponse({
      meetingSummary,
      cards: [card()]
    });
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(meeting());

  assert.deepEqual(urls, [
    "https://api.cerebras.ai/v1/chat/completions",
    "https://openrouter.ai/api/v1/chat/completions"
  ]);
  assert.deepEqual(models, ["gpt-oss-120b", "test-openrouter-model"]);
  assert.equal(result.summary.cards.length, 1);
});

test("tries all Cerebras keys before all OpenRouter keys", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  const providers: string[] = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  process.env.OPENROUTER_API_KEY_2 = "test-openrouter-key-2";
  process.env.CEREBRAS_API_KEY = "test-cerebras-key";
  process.env.CEREBRAS_API_KEY_2 = "test-cerebras-key-2";

  globalThis.fetch = (async (url, init) => {
    const authorization = new Headers(init?.headers).get("Authorization");
    providers.push(`${String(url).includes("openrouter.ai") ? "openrouter" : "cerebras"}:${authorization}`);

    if (authorization !== "Bearer test-openrouter-key-2") {
      return new Response("temporarily rate-limited", { status: 429 });
    }

    return openRouterResponse({ meetingSummary, cards: [card()] });
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(meeting());

  assert.deepEqual(providers, [
    "cerebras:Bearer test-cerebras-key",
    "cerebras:Bearer test-cerebras-key-2",
    "openrouter:Bearer test-openrouter-key",
    "openrouter:Bearer test-openrouter-key-2"
  ]);
  assert.equal(result.summary.cards.length, 1);
});

test("does not sleep on an impractical provider retry-after", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  const sleepDelays: number[] = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  process.env.OPENROUTER_SUMMARY_MAX_ATTEMPTS = "3";
  globalThis.fetch = (async () =>
    new Response("Tokens per day limit exceeded", {
      status: 429,
      headers: { "Retry-After": "86400" }
    })) as typeof fetch;

  await assert.rejects(
    generateSummaryForMeeting(meeting(), {
      sleep: async (ms) => {
        sleepDelays.push(ms);
      }
    }),
    /Tokens per day limit exceeded/
  );

  assert.deepEqual(sleepDelays, []);
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
      action: "Approve the $100 park maintenance contract.",
      result: null,
      sourceUrl: "https://city.example/agendas/4",
      rowText: "The $100 contract provides maintenance for city parks and recreation spaces."
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

test("falls back to OpenRouter when isolated Cerebras topic verification is rate-limited", async (t) => {
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
      action: "Approve the $100 park maintenance contract.",
      result: null,
      sourceUrl: "https://city.example/agendas/4",
      rowText: "The $100 contract provides maintenance for city parks."
    }
  ];

  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    if (urls.length === 1) {
      return openRouterResponse({ meetingSummary, cards: [card()] });
    }
    if (urls.length === 2) {
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
    "https://api.cerebras.ai/v1/chat/completions",
    "https://api.cerebras.ai/v1/chat/completions",
    "https://openrouter.ai/api/v1/chat/completions"
  ]);
  assert.deepEqual(result.summary.cards[0].categoryTags, ["Parks & Environment"]);
});

test("keeps a validated summary when topic verification returns malformed JSON", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  const logs: string[] = [];
  let calls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  const preparedMeeting = meeting();
  preparedMeeting.items = [
    {
      externalId: "item-4",
      fileNumber: null,
      agendaNumber: "4",
      itemType: "Business",
      title: "Item 4 - Contract approval",
      action: "Consider a $100 contract for park maintenance at 7:00 PM.",
      result: null,
      sourceUrl: "https://city.example/agendas/4",
      rowText: "The council will consider a $100 contract for park maintenance at 7:00 PM."
    }
  ];

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return openRouterResponse({
        meetingSummary,
        cards: [card({ status: "Under discussion" })]
      });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "{malformed" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(preparedMeeting, {
    log: (message) => logs.push(message)
  });

  assert.equal(calls, 2);
  assert.equal(result.summary.cards.length, 1);
  assert.equal(result.summary.cards[0].status, "Under discussion");
  assert.ok(logs.some((message) => message.includes("keeping the validated summary")));
});

test("builds bounded agenda-item batches without dropping the final item", () => {
  const preparedMeeting = meeting();
  preparedMeeting.items = Array.from({ length: 12 }, (_, index) => ({
    externalId: `item-${index + 1}`,
    fileNumber: null,
    agendaNumber: String(index + 1),
    itemType: "Business",
    title: `Decision ${index + 1}`,
    action: `Approve decision ${index + 1}.`,
    result: null,
    sourceUrl: "https://city.example/agendas/4",
    rowText: `UNIQUE_ITEM_${index + 1} ${"context ".repeat(1000)}`
  }));

  const batches = buildAgendaItemSummaryBatches(preparedMeeting);
  assert.ok(batches.length > 1);
  assert.equal(batches.flatMap((batch) => batch.items || []).length, 12);
  assert.ok(batches.every((batch) => batch.llmInputText.length <= MAX_AGENDA_ITEM_BATCH_CHARS + 500));
  assert.ok(batches.some((batch) => batch.llmInputText.includes("UNIQUE_ITEM_12")));
});

test("summarizes and combines every bounded agenda-item batch", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  let summaryCalls = 0;
  let verificationCalls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  const preparedMeeting = meeting();
  preparedMeeting.items = ["Alpha", "Beta", "Gamma"].map((name, index) => ({
    externalId: `item-${name.toLowerCase()}`,
    fileNumber: null,
    agendaNumber: String(index + 1),
    itemType: "Business",
    title: `Decision ${name}`,
    action: `Review Decision ${name}.`,
    result: null,
    sourceUrl: "https://city.example/agendas/4",
    rowText: `Decision ${name} context ${"supporting context ".repeat(500)}`
  }));

  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body || "{}")) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const system = body.messages?.[0]?.content || "";
    const user = body.messages?.find((message) => message.role === "user")?.content || "";

    if (system.includes("validate civic agenda-card topics")) {
      verificationCalls += 1;
      const indexes = Array.from(user.matchAll(/CARD (\d+)/g), (match) => Number(match[1]));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  cards: indexes.map((cardIndex) => ({
                    cardIndex,
                    categoryTags: ["City Services"],
                    status: "Under discussion"
                  }))
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    summaryCalls += 1;
    const titles = Array.from(user.matchAll(/Official title: (Decision [A-Za-z]+)/g), (match) => match[1]);
    return openRouterResponse({
      meetingSummary,
      cards: titles.map((title) =>
        card({
          agendaItem: title,
          whatIsHappening: [`${title} will be reviewed.`],
          whyItMatters: `${title} affects city services.`,
          whoItAffects: ["residents"],
          categoryTags: ["City Services"],
          status: "Under discussion"
        })
      ),
      translations: {
        es: {
          cards: titles.map((title) => ({
            agendaItem: title,
            whatIsHappening: [`${title} será revisada.`],
            whyItMatters: `${title} afecta los servicios municipales.`,
            whoItAffects: ["residentes"],
            status: "Under discussion",
            commentWindow: { opens: "No indicado.", closes: "No indicado." },
            howToAct: { attend: "Asista.", email: "No indicado.", submitComment: "No indicado." }
          }))
        }
      }
    });
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(preparedMeeting);

  assert.equal(summaryCalls, 2);
  assert.equal(verificationCalls, 2);
  assert.deepEqual(result.summary.cards.map((value) => value.agendaItem), [
    "Decision Alpha",
    "Decision Beta",
    "Decision Gamma"
  ]);
  assert.equal(result.summary.translations?.es?.cards.length, 3);
});
