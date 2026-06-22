import assert from "node:assert/strict";
import test from "node:test";
import { getHighlightExcerpt, splitHighlightMatches } from "@/lib/utils/highlightText";

test("finds every search match without changing the original casing", () => {
  assert.deepEqual(splitHighlightMatches("Road work on ROAD 101", "road"), [
    { text: "Road", isMatch: true },
    { text: " work on ", isMatch: false },
    { text: "ROAD", isMatch: true },
    { text: " 101", isMatch: false }
  ]);
});

test("treats punctuation as text and ignores empty searches", () => {
  assert.deepEqual(splitHighlightMatches("Budget (2026) update", "(2026)"), [
    { text: "Budget ", isMatch: false },
    { text: "(2026)", isMatch: true },
    { text: " update", isMatch: false }
  ]);
  assert.deepEqual(splitHighlightMatches("Road work", "  "), [
    { text: "Road work", isMatch: false }
  ]);
});

test("builds a compact excerpt around a match in otherwise hidden text", () => {
  const text = `${"Earlier context ".repeat(20)}street repairs will begin next month. ${"Later context ".repeat(20)}`;
  const excerpt = getHighlightExcerpt(text, "street", 120);

  assert.ok(excerpt?.startsWith("…"));
  assert.ok(excerpt?.endsWith("…"));
  assert.ok(excerpt?.includes("street repairs"));
  assert.ok((excerpt?.length || 0) <= 122);
});
