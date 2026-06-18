import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";
import { PORTAL_READY_SELECTOR, waitForPortal } from "@/lib/scraper/primegov";

type Call = {
  method: string;
  args: unknown[];
};

test("waitForPortal waits for portal links instead of network idle", async () => {
  const calls: Call[] = [];
  const page = {
    goto: async (url: string, options: unknown) => {
      calls.push({ method: "goto", args: [url, options] });
      return null;
    },
    waitForLoadState: async (state: string, options: unknown) => {
      calls.push({ method: "waitForLoadState", args: [state, options] });
    },
    waitForSelector: async (selector: string, options: unknown) => {
      calls.push({ method: "waitForSelector", args: [selector, options] });
      return null;
    }
  } as unknown as Page;

  await waitForPortal(page, "https://city.example/public/portal");

  const gotoCall = calls.find((call) => call.method === "goto");
  const gotoOptions = gotoCall?.args[1] as { waitUntil?: string; timeout?: number };
  assert.equal(gotoCall?.args[0], "https://city.example/public/portal");
  assert.equal(gotoOptions.waitUntil, "domcontentloaded");
  assert.notEqual(gotoOptions.waitUntil, "networkidle");
  assert.equal(gotoOptions.timeout, 60000);

  const selectorCall = calls.find((call) => call.method === "waitForSelector");
  assert.equal(selectorCall?.args[0], PORTAL_READY_SELECTOR);
  assert.deepEqual(selectorCall?.args[1], { timeout: 60000 });
});

test("waitForPortal still waits for portal links if load state times out", async () => {
  const calls: Call[] = [];
  const page = {
    goto: async (url: string, options: unknown) => {
      calls.push({ method: "goto", args: [url, options] });
      return null;
    },
    waitForLoadState: async (state: string, options: unknown) => {
      calls.push({ method: "waitForLoadState", args: [state, options] });
      throw new Error("load state timed out");
    },
    waitForSelector: async (selector: string, options: unknown) => {
      calls.push({ method: "waitForSelector", args: [selector, options] });
      return null;
    }
  } as unknown as Page;

  await waitForPortal(page, "https://city.example/public/portal");

  assert.ok(calls.some((call) => call.method === "waitForSelector"));
});
