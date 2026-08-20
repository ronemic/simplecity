import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const homepageData = readFileSync(new URL("../components/HomepageData.tsx", import.meta.url), "utf8");
const homepageDataRoute = readFileSync(
  new URL("../app/homepage-data/[jurisdiction]/[locale]/data.json/route.ts", import.meta.url),
  "utf8"
);
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("homepage document has no database dependency", () => {
  assert.doesNotMatch(homepage, /@\/lib\/db\/queries/);
  assert.doesNotMatch(homepage, /getPublishedCard|getDecisionCard|getUpcomingDecision/);
  assert.match(homepage, /<HomepageDataProvider/);
  assert.match(homepage, /<HomepageDataContent/);
  assert.match(homepageData, /fetch\(url/);
  assert.match(homepageData, /status: "loading"/);
});

test("homepage data endpoint is publicly reusable and avoids an exact count", () => {
  assert.match(homepageDataRoute, /getPublishedCardPreview/);
  assert.doesNotMatch(homepageDataRoute, /getUpcomingDecisionSnapshot/);
  assert.doesNotMatch(homepageDataRoute, /getPublishedCardCount/);
  assert.match(homepageDataRoute, /selectDiverseCards\(preferredCards, 4\)/);
  assert.match(homepageDataRoute, /Cache-Control/);
  assert.match(homepageDataRoute, /s-maxage=\$\{CACHE_SECONDS\}/);
  assert.match(homepageDataRoute, /stale-while-revalidate=86400/);
});

test("service worker does not buffer streamed pages while writing its cache", () => {
  const pageHandlerStart = serviceWorker.indexOf("async function networkFirstPage");
  const pageHandlerEnd = serviceWorker.indexOf('self.addEventListener("install"', pageHandlerStart);
  const pageHandler = serviceWorker.slice(pageHandlerStart, pageHandlerEnd);

  assert.ok(pageHandlerStart >= 0);
  assert.ok(pageHandlerEnd > pageHandlerStart);
  assert.match(serviceWorker, /event\.waitUntil\([\s\S]*\.open\(PAGE_CACHE\)/);
  assert.doesNotMatch(pageHandler, /await cache\.put\(/);
  assert.doesNotMatch(pageHandler.split("try {")[0], /caches\.open\(PAGE_CACHE\)/);
  assert.match(serviceWorker, /staleWhileRevalidateHomepageData/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/homepage-data\/"\)/);
});
