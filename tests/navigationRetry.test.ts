import assert from "node:assert/strict";
import test from "node:test";
import { retryInitialNavigation } from "@/lib/scraper/navigation";

test("initial scraper navigation retries one transient failure", async () => {
  let attempts = 0;
  const logs: string[] = [];
  const result = await retryInitialNavigation(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary navigation timeout");
    return "loaded";
  }, {
    label: "Test portal",
    log: (message) => logs.push(message),
    retryDelayMs: 0
  });

  assert.equal(result, "loaded");
  assert.equal(attempts, 2);
  assert.deepEqual(logs, ["Test portal did not load on the first attempt; retrying once."]);
});

test("initial scraper navigation surfaces a repeated failure after two attempts", async () => {
  let attempts = 0;
  await assert.rejects(
    retryInitialNavigation(async () => {
      attempts += 1;
      throw new Error("portal unavailable");
    }, { label: "Test portal", retryDelayMs: 0 }),
    /portal unavailable/
  );
  assert.equal(attempts, 2);
});
