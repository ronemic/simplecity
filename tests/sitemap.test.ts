import assert from "node:assert/strict";
import test from "node:test";
import { buildSitemapEntries } from "@/app/sitemap";

test("sitemap exposes discovery pages without individual content", () => {
  const entries = buildSitemapEntries("https://simplecity.app");
  const urls = entries.map((entry) => entry.url);

  assert.ok(urls.includes("https://simplecity.app/?lang=en"));
  assert.ok(urls.includes("https://simplecity.app/decisions?lang=en"));
  assert.ok(urls.includes("https://simplecity.app/meetings?lang=en"));
  assert.ok(urls.includes("https://simplecity.app/topics/housing?lang=en"));
  assert.ok(urls.includes("https://simplecity.app/topics/housing?lang=es"));
  assert.ok(urls.includes("https://simplecity.app/decisions?jurisdiction=san-mateo&lang=en"));
  assert.ok(urls.includes("https://simplecity.app/decisions?jurisdiction=san-mateo&lang=es"));
  assert.ok(urls.includes("https://simplecity.app/topics/housing?jurisdiction=san-mateo&lang=en"));
  assert.ok(
    urls.includes(
      "https://simplecity.app/topics/teaching-learning?jurisdiction=los-altos-school-district&lang=en"
    )
  );
  assert.equal(
    urls.includes(
      "https://simplecity.app/topics/housing?jurisdiction=los-altos-school-district&lang=en"
    ),
    false
  );
  assert.ok(urls.includes("https://simplecity.app/subscribe?lang=es"));
  assert.ok(urls.includes("https://simplecity.app/privacy?lang=en"));
  assert.ok(urls.includes("https://simplecity.app/cookies?lang=es"));
  assert.equal(
    entries.find((entry) => entry.url === "https://simplecity.app/about?lang=en")?.priority,
    0.9
  );
  assert.equal(urls.some((url) => url.includes("/cards/")), false);
  assert.equal(urls.some((url) => /\/meetings\/[^?]/.test(url)), false);

  const spanishAbout = entries.find(
    (entry) => entry.url === "https://simplecity.app/about?lang=es"
  );
  assert.deepEqual(spanishAbout?.alternates?.languages, {
    "en-US": "https://simplecity.app/about?lang=en",
    "es-US": "https://simplecity.app/about?lang=es",
    "x-default": "https://simplecity.app/about"
  });
});
