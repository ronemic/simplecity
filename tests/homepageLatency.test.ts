import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const homepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const homepageData = readFileSync(new URL("../components/HomepageData.tsx", import.meta.url), "utf8");
const queries = readFileSync(new URL("../lib/db/queries.ts", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("homepage renders its decisions on the server, not through a client fetch", () => {
  // The cards used to arrive from a client fetch after hydration, which put a
  // JS download and a second round trip in front of every first paint.
  assert.doesNotMatch(homepageData, /"use client"/);
  assert.doesNotMatch(homepageData, /fetch\(/);
  assert.doesNotMatch(homepageData, /useEffect|useState|createContext/);
  assert.ok(!existsSync(new URL("../app/homepage-data", import.meta.url)));

  assert.match(homepage, /getHomepageContent/);
  assert.match(homepage, /<HomepageDecisions/);
});

test("homepage streams its shell ahead of the decisions query", () => {
  // Both slow regions sit behind Suspense so the hero flushes immediately and
  // a cold cache never delays the first byte.
  assert.match(homepage, /<Suspense fallback=\{<HomepageContentLoading/);
  assert.match(homepage, /<Suspense fallback=\{<HomepageHeroStatusLoading/);
});

test("the homepage cache stores the ranked selection, not the candidate pool", () => {
  // Caching the pool left the ranking sort and a ~1MB deserialize outside the
  // cache, so every request paid them however warm the cache was.
  const start = queries.indexOf("const getCachedHomepageSelection = unstable_cache(");
  const end = queries.indexOf('["homepage-selection-v2"]', start);
  const cached = queries.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(cached, /compareCardsByPublicInterest/);
  assert.match(cached, /isPublicInterestCard/);
  assert.match(cached, /selectDiverseCards\(preferred, HOMEPAGE_DECISION_CARD_COUNT\)/);
  assert.match(cached, /selectUpcomingMeetingCards\(preferred, HOMEPAGE_MEETING_CARD_COUNT\)/);
  assert.doesNotMatch(queries, /getPublishedCardPreview/);
});

test("only the selected cards are translated", () => {
  // Translating the whole pool meant a per-request lookup for hundreds of rows
  // that were never rendered, and ranked Spanish text with English patterns.
  assert.match(queries, /translateSelectedCards\(selection, cards, entryLocale\)/);
  assert.doesNotMatch(queries, /loadHomepagePreviewCardsForProject/);
});

test("every locale is built into one cached selection", () => {
  // Ranking runs on English text, so the locales pick the same cards. Keying
  // the expensive layer by locale made switching language re-run the whole
  // fan-out and ranking to reach an identical result, which is why the toggle
  // took over a second.
  const start = queries.indexOf("const getCachedHomepageSelection = unstable_cache(");
  const signature = queries.slice(start, queries.indexOf("=>", start));

  assert.doesNotMatch(signature, /locale/);
  assert.match(queries, /LOCALES\.map\(async \(entryLocale\)/);
  assert.match(queries, /const localized = await getCachedHomepageSelection\(selection\);/);

  // A cached call nested inside another cache scope always recomputes, so the
  // per-locale layer must not be a second unstable_cache.
  assert.doesNotMatch(queries, /getCachedLocalizedHomepageSelection/);
});

test("a failed decisions read degrades one section, not the whole homepage", () => {
  // Server rendering routes an unhandled read error to the route error
  // boundary, which would replace the hero and topics too.
  assert.match(homepage, /console\.error\("Failed to load homepage decisions"/);
  assert.match(homepage, /if \(!content\) return <HomepageContentUnavailable locale=\{locale\} \/>;/);
  assert.match(homepageData, /export function HomepageContentUnavailable/);
});

test("counts shown to readers are counts, not query limits", () => {
  // The hero reported the candidate-pool size, which is capped by the preview
  // limit -- so it read "80 published decisions available" for any jurisdiction
  // with a deeper catalogue, and 520 for the all-jurisdictions view.
  assert.match(queries, /const totalCount = publishedCount \|\| pool\.length;/);
  assert.match(queries, /countPublishedCards\(selection\)/);

  // The search badge counted one page of results rather than the matches.
  assert.doesNotMatch(homepageData, /\$\{cards\.length\} (matching|decisiones)/);
  assert.match(homepageData, /\$\{availableCardCount\} matching decisions/);
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
  assert.doesNotMatch(serviceWorker, /HOMEPAGE_DATA_CACHE/);
  assert.doesNotMatch(serviceWorker, /staleWhileRevalidateHomepageData/);
});
