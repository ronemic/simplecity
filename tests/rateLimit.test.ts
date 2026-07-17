import assert from "node:assert/strict";
import test from "node:test";
import { consumeLocalRateLimit, getRequestIp, rateLimitedResponse } from "@/lib/security/rateLimit";

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
