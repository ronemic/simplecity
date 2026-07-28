import assert from "node:assert/strict";
import test from "node:test";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";

test("Spanish SEO URLs are self-canonical and point back to English", () => {
  const urls = localizedSeoUrls("/decisions?jurisdiction=san-mateo", "es");

  assert.equal(new URL(urls.canonical).search, "?jurisdiction=san-mateo&lang=es");
  assert.equal(new URL(urls.languages["en-US"]).search, "?jurisdiction=san-mateo&lang=en");
  assert.equal(
    new URL(urls.languages["es-US"]).search,
    "?jurisdiction=san-mateo&lang=es"
  );
  assert.equal(new URL(urls.languages["x-default"]).search, "?jurisdiction=san-mateo");
});

test("English SEO URLs use an explicit language parameter", () => {
  const urls = localizedSeoUrls("/about?lang=en", "en");

  assert.equal(new URL(urls.canonical).pathname, "/about");
  assert.equal(new URL(urls.canonical).search, "?lang=en");
  assert.equal(new URL(urls.languages["x-default"]).search, "");
  assert.equal(new URL(urls.languages["es-US"]).search, "?lang=es");
  assert.equal(seoLocale("es"), "es");
  assert.equal(seoLocale("en"), "en");
  assert.equal(seoLocale("invalid"), "en");
});
