import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { BETA_REQUEST_HEADER } from "@/lib/betaRoutes";
import { LOCALE_COOKIE } from "@/lib/i18n";

test("the URL selects the design even when the client sends a forged theme header", () => {
  for (const [path, supplied, expected] of [
    ["/", "1", "0"],
    ["/decisions", "1", "0"],
    ["/beta", "0", "1"],
    ["/beta/meetings", "0", "1"],
    ["/betamax", "1", "0"]
  ]) {
    const response = proxy(new NextRequest(`https://simplecity.app${path}`, {
      headers: { [BETA_REQUEST_HEADER]: supplied }
    }));
    assert.equal(response.headers.get(`x-middleware-request-${BETA_REQUEST_HEADER}`), expected);
  }
});

test("beta canonical redirects preserve the beta route and locale", () => {
  const response = proxy(new NextRequest("https://simplecity.app/beta/about?jurisdiction=all&lang=es"));
  assert.equal(response.headers.get("location"), "https://simplecity.app/beta/about?lang=es");
  assert.equal(response.cookies.get(LOCALE_COOKIE)?.value, "es");
});

test("beta rendering is excluded from search indexing", () => {
  const beta = proxy(new NextRequest("https://simplecity.app/beta/decisions"));
  const classic = proxy(new NextRequest("https://simplecity.app/decisions"));
  assert.equal(beta.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(classic.headers.get("x-robots-tag"), null);
});

test("beta does not expose the blocked admin and summarization routes", () => {
  for (const path of ["/beta/admin", "/beta/admin/cards", "/beta/api/summarize"]) {
    const response = proxy(new NextRequest(`https://simplecity.app${path}`));
    assert.equal(response.headers.get("x-middleware-rewrite"), "https://simplecity.app/__simplecity_not_found__");
  }
});
