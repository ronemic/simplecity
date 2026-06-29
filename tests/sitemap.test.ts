import assert from "node:assert/strict";
import test from "node:test";
import sitemap from "@/app/sitemap";

test("sitemap lists only core pages", async () => {
  const urls = await sitemap();
  const urlStrings = urls.map((r) => r.url);

  // 1. Core static pages
  assert.ok(urlStrings.includes("http://localhost:3000/"));
  assert.ok(urlStrings.includes("http://localhost:3000/about"));
  assert.ok(urlStrings.includes("http://localhost:3000/decisions"));
  assert.ok(urlStrings.includes("http://localhost:3000/meetings"));
  assert.ok(urlStrings.includes("http://localhost:3000/topics"));

  // 3. Verify individual meeting/topic links are NOT included
  assert.equal(urlStrings.some(url => url.includes("/meetings/")), false);
  assert.equal(urlStrings.some(url => url.includes("/topics/")), false);
});
