import assert from "node:assert/strict";
import test from "node:test";
import { publicErrorMessage, redactPublicLogMessage } from "@/lib/logging/publicLog";

test("public scraper logs redact personal and credential-bearing values", () => {
  const message = redactPublicLogMessage(
    "Failed for resident@example.com at /Users/patrick/project from " +
      "https://user:pass@example.test/file?token=private-token&email=resident%40example.com&meeting=42 " +
      "or 650-555-1212 using Bearer abc123 and env-secret-value",
    ["env-secret-value"]
  );

  assert.equal(
    message,
    "Failed for [redacted email] at /Users/[redacted]/project from " +
      "https://[redacted credentials]@example.test/file?token=[redacted]&email=[redacted]&meeting=42 " +
      "or [redacted phone] using " +
      "Bearer [redacted credential] and [redacted secret]"
  );
});

test("public scraper logs remain single-line and preserve useful context", () => {
  assert.equal(
    redactPublicLogMessage("Downloaded 12 documents\nfor City Council"),
    "Downloaded 12 documents for City Council"
  );
  assert.equal(
    publicErrorMessage(new Error("Request for clerk@city.gov failed"), "Unknown error"),
    "Request for [redacted email] failed"
  );
});
