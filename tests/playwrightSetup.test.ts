import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const action = readFileSync(
  new URL("../.github/actions/setup-playwright/action.yml", import.meta.url),
  "utf8"
);

test("Playwright setup tolerates transient dependency mirrors but verifies Chromium", () => {
  assert.match(action, /PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT:\s*"120000"/);
  assert.match(action, /for attempt in 1 2 3/);
  assert.match(action, /npx playwright install-deps chromium \|\| true/);
  assert.match(action, /chromium\.launch\(\{ headless: true \}\)/);
  assert.match(action, /Chromium could not be installed and launched after three attempts/);
});
