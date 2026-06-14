import assert from "node:assert/strict";
import test from "node:test";
import sitemap from "@/app/sitemap";

test("sitemap lists only core pages and jurisdiction landing pages", async () => {
  const urls = await sitemap();
  const urlStrings = urls.map((r) => r.url);

  // 1. Core static pages
  assert.ok(urlStrings.includes("http://localhost:3000/"));
  assert.ok(urlStrings.includes("http://localhost:3000/about"));
  assert.ok(urlStrings.includes("http://localhost:3000/decisions"));
  assert.ok(urlStrings.includes("http://localhost:3000/meetings"));
  assert.ok(urlStrings.includes("http://localhost:3000/categories"));

  // 2. Core pages with jurisdiction parameters
  assert.ok(urlStrings.includes("http://localhost:3000/?jurisdiction=san-mateo"));
  assert.ok(urlStrings.includes("http://localhost:3000/decisions?jurisdiction=san-mateo"));
  assert.ok(urlStrings.includes("http://localhost:3000/meetings?jurisdiction=san-mateo"));
  assert.ok(urlStrings.includes("http://localhost:3000/categories?jurisdiction=san-mateo"));

  assert.ok(urlStrings.includes("http://localhost:3000/?jurisdiction=foster-city"));
  assert.ok(urlStrings.includes("http://localhost:3000/decisions?jurisdiction=foster-city"));
  assert.ok(urlStrings.includes("http://localhost:3000/meetings?jurisdiction=foster-city"));
  assert.ok(urlStrings.includes("http://localhost:3000/categories?jurisdiction=foster-city"));

  // 3. Verify individual meeting/category links are NOT included
  assert.equal(urlStrings.some(url => url.includes("/meetings/")), false);
  assert.equal(urlStrings.some(url => url.includes("/categories/")), false);
});
