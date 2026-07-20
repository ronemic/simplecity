import assert from "node:assert/strict";
import test from "node:test";
import {
  createScrapeRequestSignature,
  isValidScrapeRequestSignature
} from "@/lib/security/scrapeRequest";

const secret = "test-only-secret-with-sufficient-entropy";
const timestamp = "1784563200";
const requestUrl =
  "https://simplecity.example/api/scrape?jurisdiction=san-francisco&background=true";

test("accepts a current signature bound to the exact scraper request", () => {
  const signature = createScrapeRequestSignature(secret, timestamp, requestUrl);

  assert.equal(
    isValidScrapeRequestSignature({
      secret,
      timestamp,
      signature,
      requestUrl,
      nowSeconds: Number(timestamp) + 60
    }),
    true
  );
});

test("rejects expired, malformed, or request-replayed scraper signatures", () => {
  const signature = createScrapeRequestSignature(secret, timestamp, requestUrl);

  assert.equal(
    isValidScrapeRequestSignature({
      secret,
      timestamp,
      signature,
      requestUrl,
      nowSeconds: Number(timestamp) + 301
    }),
    false
  );
  assert.equal(
    isValidScrapeRequestSignature({
      secret,
      timestamp,
      signature,
      requestUrl: requestUrl.replace("san-francisco", "all"),
      nowSeconds: Number(timestamp)
    }),
    false
  );
  assert.equal(
    isValidScrapeRequestSignature({
      secret,
      timestamp,
      signature: "not-a-signature",
      requestUrl,
      nowSeconds: Number(timestamp)
    }),
    false
  );
});
