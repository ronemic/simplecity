import assert from "node:assert/strict";
import test from "node:test";
import { isSimpleCityProductionHost } from "@/lib/serviceWorker";

test("service worker host guard allows the canonical production host", () => {
  assert.equal(isSimpleCityProductionHost("simplecity.app"), true);
});

test("service worker host guard allows production subdomains", () => {
  assert.equal(isSimpleCityProductionHost("www.simplecity.app"), true);
});

test("service worker host guard rejects local and preview hosts", () => {
  assert.equal(isSimpleCityProductionHost("localhost"), false);
  assert.equal(isSimpleCityProductionHost("127.0.0.1"), false);
  assert.equal(isSimpleCityProductionHost("simplecity-preview.onrender.com"), false);
});
