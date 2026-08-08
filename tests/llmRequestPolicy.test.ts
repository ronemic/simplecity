import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateLlmTokens,
  jitteredBackoffMs,
  observeLlmRateLimitHeaders,
  parseRetryAfterMs,
  resetLlmCapacityForTests,
  waitForLlmCapacity
} from "@/lib/llm/requestPolicy";

test("paces against prompt tokens plus requested completion tokens", () => {
  assert.equal(estimateLlmTokens("x".repeat(400), 600), 700);
  assert.equal(jitteredBackoffMs(1000, 3, () => 0.5), 4000);
});

test("parses Retry-After seconds and HTTP dates", () => {
  assert.equal(parseRetryAfterMs(new Headers({ "Retry-After": "2" }), 0), 2000);
  assert.equal(
    parseRetryAfterMs(new Headers({ "Retry-After": "Thu, 01 Jan 1970 00:00:05 GMT" }), 1000),
    4000
  );
});

test("honors token-remaining and reset headers before another request", async () => {
  resetLlmCapacityForTests();
  const now = Date.now();
  observeLlmRateLimitHeaders(
    "Cerebras:model",
    new Headers({
      "x-ratelimit-remaining-tokens-minute": "10",
      "x-ratelimit-reset-tokens-minute": "2s"
    }),
    now
  );
  const delays: number[] = [];
  await waitForLlmCapacity({
    capacityKey: "Cerebras:model",
    label: "Cerebras",
    prompt: "x".repeat(400),
    maxCompletionTokens: 100,
    minIntervalMs: 0,
    tokensPerMinute: 0,
    sleep: async (ms) => delays.push(ms)
  });
  assert.equal(delays.length, 1);
  assert.ok(delays[0] > 1900 && delays[0] <= 2000);
});
