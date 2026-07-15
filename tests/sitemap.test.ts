import assert from "node:assert/strict";
import test from "node:test";
import { buildSitemapEntries } from "@/app/sitemap";

test("sitemap exposes discovery pages without individual content", () => {
  const entries = buildSitemapEntries("https://simplecity.app");
  const urls = entries.map((entry) => entry.url);

  assert.ok(urls.includes("https://simplecity.app/"));
  assert.ok(urls.includes("https://simplecity.app/decisions"));
  assert.ok(urls.includes("https://simplecity.app/meetings"));
  assert.ok(urls.includes("https://simplecity.app/topics/housing"));
  assert.ok(urls.includes("https://simplecity.app/decisions?jurisdiction=san-mateo"));
  assert.ok(urls.includes("https://simplecity.app/topics/housing?jurisdiction=san-mateo"));
  assert.equal(urls.some((url) => url.includes("/cards/")), false);
  assert.equal(urls.some((url) => /\/meetings\/[^?]/.test(url)), false);
});
