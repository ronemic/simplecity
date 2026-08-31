import assert from "node:assert/strict";
import test from "node:test";

const body = { style: { overflow: "" } };
// The lock reads `document` at call time, so a stub is enough to exercise the
// nesting that the expanded map and the preview modal actually produce.
(globalThis as { document?: unknown }).document = { body };

const { lockBodyScroll } = await import("@/lib/utils/scrollLock");

test("nested locks only restore page scrolling once the last one releases", () => {
  body.style.overflow = "auto";

  const releaseMap = lockBodyScroll();
  assert.equal(body.style.overflow, "hidden");

  const releaseModal = lockBodyScroll();
  assert.equal(body.style.overflow, "hidden");

  // The expanded map can close while the modal it opened is still covering the
  // page, which previously handed scrolling back underneath the modal.
  releaseMap();
  assert.equal(body.style.overflow, "hidden");

  releaseModal();
  assert.equal(body.style.overflow, "auto");
});

test("a repeated release cannot unlock scrolling a second time", () => {
  body.style.overflow = "auto";

  const release = lockBodyScroll();
  const other = lockBodyScroll();
  release();
  release();
  assert.equal(body.style.overflow, "hidden");

  other();
  assert.equal(body.style.overflow, "auto");
});
