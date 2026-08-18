import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeLocalRateLimit,
  getRequestIp,
  localRateLimitEntryCount,
  rateLimitedResponse
} from "@/lib/security/rateLimit";

test("uses the deployment-provided client IP for rate limiting", () => {
  const request = new Request("https://simplecity.example/api/admin/login", {
    headers: {
      "x-vercel-forwarded-for": "203.0.113.10, 10.0.0.1",
      "x-forwarded-for": "198.51.100.20"
    }
  });

  assert.equal(getRequestIp(request), "203.0.113.10");
});

test("rate-limit responses include a retry delay", async () => {
  const response = rateLimitedResponse(42.2);

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "43");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "Too many requests. Please try again later.",
    retryAfterSeconds: 43
  });
});

test("local fallback enforces limits when the database function is unavailable", () => {
  const key = `test-${Math.random()}`;
  const options = { limit: 2, windowSeconds: 60, blockSeconds: 30 };

  assert.equal(consumeLocalRateLimit(key, options, 1_000).allowed, true);
  assert.equal(consumeLocalRateLimit(key, options, 2_000).allowed, true);
  assert.deepEqual(consumeLocalRateLimit(key, options, 3_000), {
    allowed: false,
    retryAfterSeconds: 30
  });
  assert.deepEqual(consumeLocalRateLimit(key, options, 4_000), {
    allowed: false,
    retryAfterSeconds: 29
  });
  assert.equal(consumeLocalRateLimit(key, options, 62_000).allowed, true);
});

test("local fallback evicts entries whose window and block have both elapsed", () => {
  const options = { limit: 1, windowSeconds: 60, blockSeconds: 30 };
  for (let index = 0; index < 5_000; index += 1) {
    consumeLocalRateLimit(`sweep-${index}`, options, 1_000);
  }

  const before = localRateLimitEntryCount();
  // Long past both the window and the block, so every entry above is dead and
  // must be reclaimed rather than retained for the life of the process.
  consumeLocalRateLimit("sweep-trigger", options, 10_000_000);

  assert.equal(localRateLimitEntryCount() < before, true);
});

test("local fallback stays bounded when every entry is still live", () => {
  const options = { limit: 5, windowSeconds: 3_600, blockSeconds: 3_600 };
  for (let index = 0; index < 25_000; index += 1) {
    consumeLocalRateLimit(`live-${index}`, options, 1_000);
  }

  assert.equal(localRateLimitEntryCount() <= 20_000, true);
});

test("a sweep keeps enforcing limits for the entries it retains", () => {
  const options = { limit: 1, windowSeconds: 3_600, blockSeconds: 3_600 };
  for (let index = 0; index < 21_000; index += 1) {
    consumeLocalRateLimit(`retained-filler-${index}`, options, 1_000);
  }

  // Created after the filler, so it is not among the oldest entries a
  // size-pressure sweep sheds.
  const key = `retained-${Math.random()}`;
  assert.equal(consumeLocalRateLimit(key, options, 2_000).allowed, true);

  for (let index = 0; index < 3_000; index += 1) {
    consumeLocalRateLimit(`retained-extra-${index}`, options, 3_000);
  }

  assert.equal(consumeLocalRateLimit(key, options, 4_000).allowed, false);
});
