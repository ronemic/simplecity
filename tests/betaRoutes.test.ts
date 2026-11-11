import assert from "node:assert/strict";
import test from "node:test";
import { isBetaPath, siteHref, withoutBetaPrefix } from "@/lib/betaRoutes";

test("beta paths use an exact segment boundary", () => {
  assert.equal(isBetaPath("/beta"), true);
  assert.equal(isBetaPath("/beta/decisions"), true);
  assert.equal(isBetaPath("/betamax"), false);
  assert.equal(isBetaPath("/decisions"), false);
  assert.equal(withoutBetaPrefix("/beta"), "/");
  assert.equal(withoutBetaPrefix("/beta/meetings/123"), "/meetings/123");
  assert.equal(withoutBetaPrefix("/meetings"), "/meetings");
});

test("beta navigation keeps routes, query parameters and anchors inside beta", () => {
  assert.equal(siteHref("/", true), "/beta");
  assert.equal(siteHref("/#subscribe", true), "/beta#subscribe");
  assert.equal(siteHref("/?lang=es", true), "/beta?lang=es");
  assert.equal(siteHref("/decisions?category=housing&page=2", true), "/beta/decisions?category=housing&page=2");
  assert.equal(siteHref("/beta/meetings", true), "/beta/meetings");
  assert.equal(siteHref("/betamax", true), "/beta/betamax");
});

test("classic links, shared APIs and external destinations keep their URLs", () => {
  assert.equal(siteHref("/decisions?category=housing", false), "/decisions?category=housing");
  for (const href of ["/api", "/api/following", "https://example.com/source", "//example.com/source", "mailto:team@example.com", "#details", "?page=2"]) {
    assert.equal(siteHref(href, true), href);
  }
});
