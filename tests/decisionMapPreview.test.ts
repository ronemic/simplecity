import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mapCanvas = readFileSync(
  new URL("../components/DecisionMapCanvas.tsx", import.meta.url),
  "utf8"
);
const modal = readFileSync(
  new URL("../components/DecisionPreviewModal.tsx", import.meta.url),
  "utf8"
);
const route = readFileSync(
  new URL("../app/api/decisions/[id]/route.ts", import.meta.url),
  "utf8"
);

test("map decision actions open an in-place preview instead of navigating", () => {
  assert.match(mapCanvas, /setPreviewPoint\(selected\.points\[0\]\)/);
  assert.match(mapCanvas, /setPreviewPoint\(point\)/);
  assert.match(mapCanvas, /<DecisionPreviewModal/);
  assert.doesNotMatch(mapCanvas, /<Link href=\{selected\.points\[0\]\.href\}/);
});

test("decision preview is modal, cached, and retains an explicit full-page option", () => {
  assert.match(modal, /createPortal\(/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /CARD_CACHE_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(modal, /target="_blank"/);
  assert.match(modal, /presentation="share"/);
});

test("preview endpoint serves published cards with a five-minute cache", () => {
  assert.match(route, /getPublishedCard\(id, locale\)/);
  assert.match(route, /public, max-age=300, s-maxage=300/);
  assert.match(route, /Decision not found/);
});
