import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";
import {
  LEGISTAR_PORTAL_READY_SELECTOR,
  waitForLegistarPortal
} from "@/lib/sources/legistar";

test("waitForLegistarPortal waits for attached Legistar content markers", async () => {
  let selector: string | undefined;
  let options: { state?: string; timeout?: number } | undefined;

  const page = {
    goto: async () => undefined,
    waitForTimeout: async () => undefined,
    waitForSelector: async (
      nextSelector: string,
      nextOptions: { state?: string; timeout?: number }
    ) => {
      selector = nextSelector;
      options = nextOptions;
      return null;
    }
  } as unknown as Page;

  await waitForLegistarPortal(page, "https://mountainview.legistar.com/Calendar.aspx", () => undefined);

  assert.equal(selector, LEGISTAR_PORTAL_READY_SELECTOR);
  assert.equal(options?.state, "attached");
  assert.equal(options?.timeout, 30000);
  assert.equal(LEGISTAR_PORTAL_READY_SELECTOR.includes(", table"), false);
});
