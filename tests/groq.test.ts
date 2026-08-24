import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgendaItemSummaryBatches,
  generateSummaryForMeeting,
  MAX_AGENDA_ITEM_BATCH_CHARS,
  runSummaryBatchesSequentially
} from "@/lib/llm/groq";
import {
  configuredLlmRequestTimeoutMs,
  fetchLlmResponse,
  formatLlmProcessRunSummary,
  getLlmProvidersForInput,
  getLlmProcessBudgetUsage,
  getLlmProcessRunSummary,
  LLM_REQUEST_TIMEOUT_MS,
  LlmProcessBudgetExceededError,
  resetLlmProcessBudgetForTests,
  runWithLlmProcessBudget
} from "@/lib/llm/provider";
import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";

const meetingSummary = {
  title: "Council Meeting",
  date: "June 13, 2026",
  status: "Upcoming",
  oneSentenceSummary: "A regular meeting."
};

test("bounds primary LLM requests at five minutes", () => {
  assert.equal(LLM_REQUEST_TIMEOUT_MS, 300_000);
});

test("allows a jurisdiction workflow to lower, but not raise, the LLM timeout", (t) => {
  const original = process.env.SIMPLECITY_LLM_REQUEST_TIMEOUT_MS;
  t.after(() => {
    if (original === undefined) delete process.env.SIMPLECITY_LLM_REQUEST_TIMEOUT_MS;
    else process.env.SIMPLECITY_LLM_REQUEST_TIMEOUT_MS = original;
  });

  process.env.SIMPLECITY_LLM_REQUEST_TIMEOUT_MS = "180000";
  assert.equal(configuredLlmRequestTimeoutMs(), 180_000);
  process.env.SIMPLECITY_LLM_REQUEST_TIMEOUT_MS = "600000";
  assert.equal(configuredLlmRequestTimeoutMs(), 300_000);
  process.env.SIMPLECITY_LLM_REQUEST_TIMEOUT_MS = "1000";
  assert.equal(configuredLlmRequestTimeoutMs(), 30_000);
});

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

test("cancelled meetings return no cards without dispatching an LLM request", async (t) => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("A cancelled meeting must not reach the provider.");
  }) as typeof fetch;

  const result = await generateSummaryForMeeting({
    ...meeting(),
    status: "Cancelled",
    llmInputText: "A stale agenda remains on the official website."
  });

  assert.equal(fetchCalls, 0);
  assert.deepEqual(result.summary.cards, []);
  assert.deepEqual(result.raw, {
    skipped: true,
    reason: "meeting_cancelled"
  });
});

function groqResponse(summary: SimpleCitySummary) {
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
    groqApiKeys: [
      process.env.GROQ_API_KEY,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY_4,
      process.env.GROQ_API_KEY_5
    ],
    groqModel: process.env.GROQ_MODEL,
    groqMaxAttempts: process.env.GROQ_SUMMARY_MAX_ATTEMPTS,
    groqRetryBaseMs: process.env.GROQ_SUMMARY_RETRY_BASE_MS,
    groqRateLimitRetryBaseMs: process.env.GROQ_RATE_LIMIT_RETRY_BASE_MS,
    llmMaxRetryDelayMs: process.env.LLM_MAX_RETRY_DELAY_MS
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
  env.groqApiKeys.forEach((value, index) => {
    restore(index === 0 ? "GROQ_API_KEY" : `GROQ_API_KEY_${index + 1}`, value);
  });
  restore("GROQ_MODEL", env.groqModel);
  restore("GROQ_SUMMARY_MAX_ATTEMPTS", env.groqMaxAttempts);
  restore("GROQ_SUMMARY_RETRY_BASE_MS", env.groqRetryBaseMs);
  restore("GROQ_RATE_LIMIT_RETRY_BASE_MS", env.groqRateLimitRetryBaseMs);
  restore("LLM_MAX_RETRY_DELAY_MS", env.llmMaxRetryDelayMs);
}

test("starts summary batches lazily and preserves source order", async () => {
  let active = 0;
  let maximumActive = 0;
  const started: number[] = [];

  const results = await runSummaryBatchesSequentially([1, 2, 3], async (batch) => {
    started.push(batch);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return { summary: { meetingSummary, cards: [] }, raw: batch };
  });

  assert.equal(maximumActive, 1);
  assert.deepEqual(started, [1, 2, 3]);
  assert.deepEqual(results.map((result) => result.raw), [1, 2, 3]);
});

test("stops lazy summary batches at a deadline while retaining completed work", async () => {
  let stopped = false;
  let stopLogged = false;
  const started: number[] = [];

  const results = await runSummaryBatchesSequentially(
    [1, 2, 3],
    async (batch) => {
      started.push(batch);
      stopped = true;
      return { summary: { meetingSummary, cards: [] }, raw: batch };
    },
    {
      shouldStop: () => stopped,
      onStopped: () => {
        stopLogged = true;
      }
    }
  );

  assert.deepEqual(started, [1]);
  assert.deepEqual(results.map((result) => result.raw), [1]);
  assert.equal(stopLogged, true);
});

test("continues independent summary batches after one batch fails", async () => {
  const errors: number[] = [];
  const results = await runSummaryBatchesSequentially(
    [1, 2, 3],
    async (batch) => {
      if (batch === 2) throw new Error("provider timeout");
      return { summary: { meetingSummary, cards: [] }, raw: batch };
    },
    {
      continueOnError: true,
      onError: (_error, index) => errors.push(index)
    }
  );

  assert.deepEqual(results.map((result) => result.raw), [1, 3]);
  assert.deepEqual(errors, [1]);
});

function setLlmTestEnv() {
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.OPENROUTER_MODEL = "openai/gpt-oss-120b";
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY_2;
  delete process.env.GROQ_API_KEY_3;
  delete process.env.GROQ_API_KEY_4;
  delete process.env.GROQ_API_KEY_5;
  delete process.env.GROQ_MODEL;
  process.env.GROQ_SUMMARY_MAX_ATTEMPTS = "3";
  process.env.GROQ_SUMMARY_RETRY_BASE_MS = "0";
  process.env.GROQ_RATE_LIMIT_RETRY_BASE_MS = "0";
}

test("times out while an LLM response body is still pending", async (t) => {
  const originalFetch = globalThis.fetch;
  const logs: string[] = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetLlmProcessBudgetForTests();
  });
  resetLlmProcessBudgetForTests();

  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"partial":'));
        }
      }),
      { status: 200 }
    )) as typeof fetch;

  await assert.rejects(
    fetchLlmResponse(
      "https://openrouter.ai/test",
      { method: "POST" },
      20,
      { label: "Test request", log: (message) => logs.push(message) }
    ),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "AbortError" &&
      /timed out after 20 milliseconds/i.test(error.message)
  );
  assert.ok(logs.some((message) => /Test request failed after \d+ms/i.test(message)));
  assert.equal(getLlmProcessRunSummary().timedOut, 1);
  assert.equal(getLlmProcessRunSummary().failed, 0);
});

test("logs completed LLM request duration and status", async (t) => {
  const originalFetch = globalThis.fetch;
  const logs: string[] = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async () =>
    new Response('{"ok":true}', { status: 200 })) as typeof fetch;

  const result = await fetchLlmResponse(
    "https://openrouter.ai/test",
    { method: "POST" },
    100,
    { label: "Test request", log: (message) => logs.push(message) }
  );

  assert.equal(result.text, '{"ok":true}');
  assert.ok(logs.some((message) =>
    /Test request completed in \d+ms \(HTTP 200\)/i.test(message)
  ));
});

test("does not retry a Groq key while its rate-limit cooldown is active", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalGroqKey2 = process.env.GROQ_API_KEY_2;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (originalGroqKey2 === undefined) delete process.env.GROQ_API_KEY_2;
    else process.env.GROQ_API_KEY_2 = originalGroqKey2;
    if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    resetLlmProcessBudgetForTests();
  });

  process.env.GROQ_API_KEY = "cooldown-key-1";
  process.env.GROQ_API_KEY_2 = "cooldown-key-2";
  process.env.OPENROUTER_API_KEY = "openrouter-key";
  resetLlmProcessBudgetForTests();
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: { message: "Rate limit reached. Please try again in 42m39.6s." }
      }),
      { status: 429 }
    )) as typeof fetch;

  await fetchLlmResponse(
    "https://api.groq.com/openai/v1/chat/completions",
    { method: "POST", body: "{}" },
    100,
    {
      label: "Rate-limited Groq request",
      provider: "Groq",
      providerApiKey: "cooldown-key-1"
    }
  );

  const providers = getLlmProvidersForInput("short prompt", 1000);
  assert.deepEqual(
    providers.map((provider) => provider.apiKey),
    ["cooldown-key-2", "openrouter-key"]
  );
});

test("never runs more than two LLM requests at once", async (t) => {
  const originalFetch = globalThis.fetch;
  let active = 0;
  let maximumActive = 0;
  const releases: Array<() => void> = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active -= 1;
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;

  const requests = Array.from({ length: 4 }, (_, index) =>
    fetchLlmResponse(
      "https://openrouter.ai/test",
      { method: "POST" },
      1000,
      { label: `Concurrent request ${index + 1}` }
    )
  );

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(active, 2);
  assert.equal(maximumActive, 2);

  while (releases.length > 0) {
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await Promise.all(requests);
  assert.equal(maximumActive, 2);
});

test("request timeout starts after waiting behind the two-request ceiling", async (t) => {
  const originalFetch = globalThis.fetch;
  const releases: Array<() => void> = [];
  let fetchCalls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    await new Promise<void>((resolve) => releases.push(resolve));
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;

  const first = fetchLlmResponse("https://openrouter.ai/test", {}, 1000, { label: "First" });
  const second = fetchLlmResponse("https://openrouter.ai/test", {}, 1000, { label: "Second" });
  await new Promise((resolve) => setTimeout(resolve, 10));

  const queued = fetchLlmResponse(
    "https://openrouter.ai/test",
    {},
    20,
    { label: "Queued" }
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(fetchCalls, 2);

  releases.shift()?.();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fetchCalls, 3);
  releases.shift()?.();
  releases.shift()?.();
  await Promise.all([first, second, queued]);
});

test("removes an aborted request from the LLM slot queue", async (t) => {
  const originalFetch = globalThis.fetch;
  const releases: Array<() => void> = [];
  const labels: string[] = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (_url, init) => {
    labels.push(String(init?.headers && (init.headers as Record<string, string>)["x-label"]));
    await new Promise<void>((resolve) => releases.push(resolve));
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;

  const first = fetchLlmResponse("https://openrouter.ai/test", { headers: { "x-label": "first" } });
  const second = fetchLlmResponse("https://openrouter.ai/test", { headers: { "x-label": "second" } });
  await new Promise((resolve) => setTimeout(resolve, 10));

  const controller = new AbortController();
  const aborted = fetchLlmResponse(
    "https://openrouter.ai/test",
    { headers: { "x-label": "aborted" }, signal: controller.signal }
  );
  const survivor = fetchLlmResponse(
    "https://openrouter.ai/test",
    { headers: { "x-label": "survivor" } }
  );
  controller.abort();
  await assert.rejects(aborted, (error: unknown) =>
    error instanceof Error && error.name === "AbortError"
  );

  releases.shift()?.();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(labels, ["first", "second", "survivor"]);

  while (releases.length > 0) {
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await Promise.all([first, second, survivor]);
});

test("gives another LLM request group the next available slot", async (t) => {
  const originalFetch = globalThis.fetch;
  const releases: Array<() => void> = [];
  const started: string[] = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (_url, init) => {
    started.push(String(init?.headers && (init.headers as Record<string, string>)["x-label"]));
    await new Promise<void>((resolve) => releases.push(resolve));
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;

  const requests = [
    fetchLlmResponse("https://openrouter.ai/test", { headers: { "x-label": "a1" } }, 1000, { label: "a1", group: "a" }),
    fetchLlmResponse("https://openrouter.ai/test", { headers: { "x-label": "a2" } }, 1000, { label: "a2", group: "a" }),
    fetchLlmResponse("https://openrouter.ai/test", { headers: { "x-label": "a3" } }, 1000, { label: "a3", group: "a" }),
    fetchLlmResponse("https://openrouter.ai/test", { headers: { "x-label": "b1" } }, 1000, { label: "b1", group: "b" })
  ];
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(started, ["a1", "a2"]);

  releases.shift()?.();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(started, ["a1", "a2", "b1"]);

  while (releases.length > 0) {
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await Promise.all(requests);
});

test("stops outbound LLM requests at the process request budget", async (t) => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetLlmProcessBudgetForTests();
  });
  resetLlmProcessBudgetForTests({ requests: 2, tokens: 10_000 });
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;

  await fetchLlmResponse("https://openrouter.ai/test", { body: "{}" });
  await fetchLlmResponse("https://openrouter.ai/test", { body: "{}" });
  await assert.rejects(
    fetchLlmResponse("https://openrouter.ai/test", { body: "{}" }),
    (error: unknown) =>
      error instanceof LlmProcessBudgetExceededError &&
      error.code === "LLM_PROCESS_BUDGET_EXCEEDED" &&
      error.retryable === false
  );
  assert.equal(fetchCalls, 2);
  assert.deepEqual(getLlmProcessRunSummary().categories, {
    summaries: 0,
    repairs: 0,
    verifications: 0,
    translations: 0,
    results: 0,
    other: 2
  });
  assert.equal(getLlmProcessRunSummary().successful, 2);
  assert.equal(getLlmProcessRunSummary().budgetBlocked, 1);
  assert.match(
    formatLlmProcessRunSummary(),
    /OpenRouter budget requests 2\/2;.*all-provider attempts 2.*HTTP successful 2/
  );
});

test("Groq attempts do not consume the OpenRouter request or token budget", async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetLlmProcessBudgetForTests();
  });
  resetLlmProcessBudgetForTests({ requests: 1, tokens: 10 });
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ usage: { total_tokens: 500 } }),
    { status: 200 }
  )) as typeof fetch;

  await fetchLlmResponse(
    "https://api.groq.com/openai/v1/chat/completions",
    { body: JSON.stringify({ prompt: "x".repeat(1_000) }) },
    1_000,
    { label: "Groq summary", provider: "Groq" }
  );
  await fetchLlmResponse(
    "https://api.groq.com/openai/v1/chat/completions",
    { body: JSON.stringify({ prompt: "x".repeat(1_000) }) },
    1_000,
    { label: "Groq translation", provider: "Groq" }
  );

  assert.deepEqual(getLlmProcessBudgetUsage(), {
    requests: 0,
    requestLimit: 1,
    tokens: 0,
    tokenLimit: 10,
    exhausted: false
  });
  const summary = getLlmProcessRunSummary();
  assert.equal(summary.dispatched, 2);
  assert.deepEqual(summary.providers, { OpenRouter: 0, Groq: 2 });
  assert.equal(summary.successful, 2);
});

test("uses provider token usage to stop before the next LLM dispatch", async (t) => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    resetLlmProcessBudgetForTests();
  });
  resetLlmProcessBudgetForTests({ requests: 10, tokens: 30 });
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 19, total_tokens: 29 } }),
      { status: 200 }
    );
  }) as typeof fetch;

  await fetchLlmResponse("https://openrouter.ai/test", { body: "{}" });
  assert.equal(getLlmProcessBudgetUsage().tokens, 29);
  await assert.rejects(
    fetchLlmResponse("https://openrouter.ai/test", { body: "{}" }),
    LlmProcessBudgetExceededError
  );
  assert.equal(fetchCalls, 1);
});

test("shares one LLM budget across nested work while isolating independent runs", async (t) => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;

  const firstRun = runWithLlmProcessBudget(async () => {
    await fetchLlmResponse("https://openrouter.ai/test", { body: "{}" });
    await runWithLlmProcessBudget(
      () => fetchLlmResponse("https://openrouter.ai/test", { body: "{}" }),
      { requests: 99 }
    );
    await assert.rejects(
      fetchLlmResponse("https://openrouter.ai/test", { body: "{}" }),
      LlmProcessBudgetExceededError
    );
    return getLlmProcessRunSummary();
  }, { requests: 2, tokens: 10_000 });

  const secondRun = runWithLlmProcessBudget(async () => {
    await fetchLlmResponse("https://openrouter.ai/test", { body: "{}" });
    return getLlmProcessRunSummary();
  }, { requests: 1, tokens: 10_000 });

  const [firstSummary, secondSummary] = await Promise.all([firstRun, secondRun]);
  assert.equal(firstSummary.requests, 2);
  assert.equal(firstSummary.budgetBlocked, 1);
  assert.equal(secondSummary.requests, 1);
  assert.equal(secondSummary.budgetBlocked, 0);
  assert.equal(fetchCalls, 3);
});

test("does not retry or sleep after the run budget or upstream deadline stops work", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  let fetchCalls = 0;
  const sleepDelays: number[] = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });
  setLlmTestEnv();
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("temporary failure", { status: 500 });
  }) as typeof fetch;

  await assert.rejects(
    runWithLlmProcessBudget(
      () => generateSummaryForMeeting(meeting(), {
        sleep: async (ms) => {
          sleepDelays.push(ms);
        }
      }),
      { requests: 0, tokens: 10_000 }
    ),
    LlmProcessBudgetExceededError
  );
  assert.equal(fetchCalls, 0);

  const controller = new AbortController();
  const deadlineError = new DOMException("Pipeline deadline reached.", "TimeoutError");
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    controller.abort(deadlineError);
    return new Response("temporary failure", { status: 500 });
  }) as typeof fetch;
  await assert.rejects(
    runWithLlmProcessBudget(() => generateSummaryForMeeting(meeting(), {
      signal: controller.signal,
      sleep: async (ms) => {
        sleepDelays.push(ms);
      }
    })),
    (error: unknown) => error === deadlineError
  );
  assert.equal(fetchCalls, 1);
  assert.deepEqual(sleepDelays, []);
});

test("interrupts the default retry delay when the upstream deadline expires", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  let fetchCalls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });
  setLlmTestEnv();
  process.env.GROQ_SUMMARY_MAX_ATTEMPTS = "2";
  process.env.GROQ_SUMMARY_RETRY_BASE_MS = "10000";
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("temporary failure", { status: 500 });
  }) as typeof fetch;

  const controller = new AbortController();
  const deadlineError = new DOMException("Pipeline deadline reached.", "TimeoutError");
  const abortTimer = setTimeout(() => controller.abort(deadlineError), 20);
  const startedAt = Date.now();
  try {
    await assert.rejects(
      generateSummaryForMeeting(meeting(), { signal: controller.signal }),
      (error: unknown) => error === deadlineError
    );
  } finally {
    clearTimeout(abortTimer);
  }

  assert.equal(fetchCalls, 1);
  assert.ok(Date.now() - startedAt < 1_000);
});

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

    return groqResponse(calls === 1 ? firstSummary : fixedSummary);
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

test("keeps repaired Spanish cards aligned when the accepted cards were untranslated", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  let calls = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  const twoItemMeeting: LlmReadyMeeting = {
    ...meeting(),
    llmInputText: (
      "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM for park maintenance. " +
      "Item 5 - Sidewalk repair. The council will consider a $100 contract at 7:00 PM for sidewalk repair. "
    ).repeat(8)
  };
  const sidewalkCard = card({
    agendaItem: "Item 5 - Sidewalk repair",
    whatIsHappening: ["The council will consider a $100 contract for sidewalk repair."]
  });

  globalThis.fetch = (async () => {
    calls += 1;

    // The first response omits translations entirely and its second card cites a
    // dollar amount the source never states, so only that card is repaired.
    if (calls === 1) {
      return groqResponse({
        meetingSummary,
        cards: [
          card(),
          card({
            agendaItem: "Item 5 - Sidewalk repair",
            whatIsHappening: ["The council will consider a $250 contract for sidewalk repair."]
          })
        ]
      });
    }

    return groqResponse({
      meetingSummary,
      cards: [sidewalkCard],
      translations: {
        es: {
          cards: [
            {
              agendaItem: "Punto 5 - Reparación de aceras",
              whatIsHappening: ["El concejo considerará un contrato de $100 para reparar aceras."],
              whyItMatters: "El contrato afecta el trabajo de reparación de aceras.",
              whoItAffects: ["peatones"],
              status: "Votación próxima",
              commentWindow: {
                opens: "No indicado en el documento fuente.",
                closes: "No indicado en el documento fuente."
              },
              howToAct: {
                attend: "Asista a la reunión a las 7:00 PM.",
                email: "No indicado en el documento fuente.",
                submitComment: "No indicado en el documento fuente."
              }
            }
          ]
        }
      }
    });
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(twoItemMeeting);
  const spanishCards = result.summary.translations?.es?.cards || [];

  assert.equal(calls, 2);
  assert.deepEqual(
    result.summary.cards.map((entry) => entry.agendaItem),
    ["Item 4 - Contract approval", "Item 5 - Sidewalk repair"]
  );
  assert.equal(spanishCards.length, result.summary.cards.length);
  assert.equal(spanishCards[0], null);
  assert.equal(spanishCards[1]?.agendaItem, "Punto 5 - Reparación de aceras");
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
    return groqResponse({
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

    return groqResponse({
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

    return groqResponse(calls === 1 ? emptySummary : fixedSummary);
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(meeting());

  assert.equal(calls, 2);
  assert.equal(result.summary.cards.length, 1);
});

test("routes a short summary through Groq without OpenRouter-only fields", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  const urls: string[] = [];
  const authorizations: Array<string | null> = [];
  const models: string[] = [];
  const referers: Array<string | null> = [];
  const titles: Array<string | null> = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  process.env.GROQ_API_KEY = "test-groq-key";
  process.env.GROQ_MODEL = "openai/gpt-oss-120b";

  globalThis.fetch = (async (url, init) => {
    urls.push(String(url));
    const headers = new Headers(init?.headers);
    const authorization = headers.get("Authorization");
    authorizations.push(authorization);
    referers.push(headers.get("HTTP-Referer"));
    titles.push(headers.get("X-Title"));
    const body = JSON.parse(String(init?.body || "{}")) as {
      model?: string;
      provider?: unknown;
      max_tokens?: number;
    };
    models.push(body.model || "");
    assert.equal(body.provider, undefined);
    assert.equal(body.max_tokens, 3_000);

    return groqResponse({
      meetingSummary,
      cards: [card()]
    });
  }) as typeof fetch;

  const result = await generateSummaryForMeeting(meeting());

  assert.deepEqual(urls, [
    "https://api.groq.com/openai/v1/chat/completions"
  ]);
  assert.deepEqual(authorizations, ["Bearer test-groq-key"]);
  assert.deepEqual(models, ["openai/gpt-oss-120b"]);
  assert.deepEqual(referers, [null]);
  assert.deepEqual(titles, [null]);
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
  process.env.GROQ_SUMMARY_MAX_ATTEMPTS = "3";
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
  process.env.GROQ_SUMMARY_MAX_ATTEMPTS = "2";
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

    return groqResponse({
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
  let topicMaxTokens = 0;

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreLlmEnv(originalEnv);
  });

  setLlmTestEnv();
  process.env.GROQ_API_KEY = "test-groq-key";
  process.env.GROQ_MODEL = "openai/gpt-oss-120b";
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
      max_tokens?: number;
    };

    if (calls === 1) {
      return groqResponse({
        meetingSummary,
        cards: [card({ categoryTags: ["Public Safety"], status: "Under discussion" })]
      });
    }

    topicPrompt = body.messages?.find((message) => message.role === "user")?.content || "";
    topicMaxTokens = body.max_tokens || 0;
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
  assert.equal(topicMaxTokens, 2_000);
  assert.match(topicPrompt, /maintenance for city parks and recreation spaces/);
  assert.doesNotMatch(topicPrompt, /FLAT_PACKET_SENTINEL/);
});

test("uses the same OpenRouter key during isolated topic verification", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = captureLlmEnv();
  const urls: string[] = [];
  const authorizations: Array<string | null> = [];

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
      itemType: null,
      title: "Item 4 - Contract approval",
      action: "Approve the $100 park maintenance contract.",
      result: null,
      sourceUrl: "https://city.example/agendas/4",
      rowText: "The $100 contract provides maintenance for city parks."
    }
  ];

  globalThis.fetch = (async (url, init) => {
    urls.push(String(url));
    authorizations.push(new Headers(init?.headers).get("Authorization"));
    if (urls.length === 1) {
      return groqResponse({ meetingSummary, cards: [card()] });
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
    "https://openrouter.ai/api/v1/chat/completions"
  ]);
  assert.deepEqual(authorizations, [
    "Bearer test-openrouter-key",
    "Bearer test-openrouter-key"
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
      return groqResponse({
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
  assert.ok(batches.every((batch) => (batch.items?.length || 0) <= 5));
  assert.equal(batches.flatMap((batch) => batch.items || []).length, 12);
  assert.ok(batches.every((batch) => batch.llmInputText.length <= MAX_AGENDA_ITEM_BATCH_CHARS + 500));
  assert.ok(batches.some((batch) => batch.llmInputText.includes("UNIQUE_ITEM_12")));
});

test("carries meeting-wide participation context into every agenda-item batch", () => {
  const preparedMeeting = meeting();
  preparedMeeting.items = [
    {
      externalId: "item-contract",
      fileNumber: null,
      agendaNumber: "4",
      itemType: "Business",
      title: "Contract approval",
      action: "Approve the contract.",
      result: null,
      sourceUrl: "https://city.example/agendas/4",
      rowText: "The council will consider the contract."
    }
  ];
  preparedMeeting.llmInputText = `
Current meeting agenda items (use each block only for its named item):
Official title: Contract approval

Current agenda and meeting-wide participation context:
Attend online with meeting ID 846 9472 6242.
Email comments to planning.commission@menlopark.gov.
1. CALL TO ORDER
4. Contract approval for $250
  `;

  const [batch] = buildAgendaItemSummaryBatches(preparedMeeting);
  assert.match(batch.llmInputText, /846 9472 6242/);
  assert.match(batch.llmInputText, /planning\.commission@menlopark\.gov/);
  assert.doesNotMatch(batch.llmInputText, /Contract approval for \$250/);
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
    return groqResponse({
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

  const expectedBatchCount = buildAgendaItemSummaryBatches(preparedMeeting).length;
  assert.equal(summaryCalls, expectedBatchCount);
  assert.equal(verificationCalls, expectedBatchCount);
  assert.deepEqual(result.summary.cards.map((value) => value.agendaItem), [
    "Decision Alpha",
    "Decision Beta",
    "Decision Gamma"
  ]);
  assert.equal(result.summary.translations?.es?.cards.length, 3);
});
