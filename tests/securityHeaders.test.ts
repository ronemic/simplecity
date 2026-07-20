import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "@/next.config.mjs";

test("all application routes receive baseline browser security headers", async () => {
  assert.equal(typeof nextConfig.headers, "function");
  const rules = await nextConfig.headers!();
  const headers = new Map(rules[0].headers.map((header) => [header.key, header.value]));

  assert.equal(rules[0].source, "/(.*)");
  assert.match(headers.get("Content-Security-Policy") || "", /frame-ancestors 'none'/);
  assert.match(headers.get("Content-Security-Policy") || "", /object-src 'none'/);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.match(headers.get("Strict-Transport-Security") || "", /max-age=31536000/);
});
