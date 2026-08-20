import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("homepage database work starts inside suspended components", () => {
  const pageRenderStart = homepage.indexOf("export default async function Home");

  assert.ok(pageRenderStart >= 0);
  assert.match(homepage, /const getHomepageData = cache\(/);
  assert.equal(homepage.indexOf("getHomepageData(", pageRenderStart), -1);
  assert.doesNotMatch(homepage, /const data = loadHomepageData/);
});

test("service worker does not buffer streamed pages while writing its cache", () => {
  const pageHandlerStart = serviceWorker.indexOf("async function networkFirstPage");
  const pageHandlerEnd = serviceWorker.indexOf('self.addEventListener("install"', pageHandlerStart);
  const pageHandler = serviceWorker.slice(pageHandlerStart, pageHandlerEnd);

  assert.ok(pageHandlerStart >= 0);
  assert.ok(pageHandlerEnd > pageHandlerStart);
  assert.match(serviceWorker, /event\.waitUntil\(cache\.put\(/);
  assert.doesNotMatch(pageHandler, /await cache\.put\(/);
});
