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
  assert.deepEqual(logs, ["Test portal did not load (attempt 1 of 4); retrying in 0s."]);
});

test("initial scraper navigation rides out an outage that outlasts the first retries", async () => {
  let attempts = 0;
  const result = await retryInitialNavigation(async () => {
    attempts += 1;
    if (attempts < 4) throw new Error("net::ERR_NAME_NOT_RESOLVED");
    return "loaded";
  }, { label: "Test portal", retryDelayMs: 0 });

  assert.equal(result, "loaded");
  assert.equal(attempts, 4);
});

test("initial scraper navigation backs off further on each retry", async () => {
  const logs: string[] = [];
  let attempts = 0;
  await retryInitialNavigation(async () => {
    attempts += 1;
    if (attempts < 4) throw new Error("temporary navigation timeout");
    return "loaded";
  }, { label: "Test portal", log: (message) => logs.push(message), retryDelayMs: 1 });

  assert.deepEqual(logs.map((message) => message.match(/attempt \d of 4/)?.[0]), [
    "attempt 1 of 4",
    "attempt 2 of 4",
    "attempt 3 of 4"
  ]);
});

test("initial scraper navigation surfaces a repeated failure after four attempts", async () => {
  let attempts = 0;
  await assert.rejects(
    retryInitialNavigation(async () => {
      attempts += 1;
      throw new Error("portal unavailable");
    }, { label: "Test portal", retryDelayMs: 0 }),
    /portal unavailable/
  );
  assert.equal(attempts, 4);
});
