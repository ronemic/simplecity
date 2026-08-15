import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

test("admin pages and APIs use the normal missing-page route", () => {
  for (const path of [
    "/admin",
    "/admin/cards",
    "/api/admin/login",
    "/api/admin/cards",
    "/api/summarize"
  ]) {
    const response = proxy(new NextRequest(`https://simplecity.example${path}`));
    assert.equal(
      response.headers.get("x-middleware-rewrite"),
      "https://simplecity.example/__simplecity_not_found__",
      path
    );
  }
});

test("public routes still pass through the request proxy", () => {
  const response = proxy(new NextRequest("https://simplecity.example/decisions"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("language preferences survive canonical jurisdiction redirects", () => {
  const response = proxy(
    new NextRequest(
      "https://simplecity.example/decisions?jurisdiction=san-mateo-city&lang=es"
    )
  );

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://simplecity.example/decisions?jurisdiction=san-mateo&lang=es"
  );
  assert.equal(response.cookies.get("simplecity_locale")?.value, "es");
});

test("shareable language URLs render in the requested language", () => {
  const response = proxy(
    new NextRequest("https://simplecity.example/about?lang=es")
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.match(response.headers.get("x-middleware-request-cookie") || "", /simplecity_locale=es/);
  assert.equal(response.cookies.get("simplecity_locale")?.value, "es");
});

test("shareable English language URLs render in English", () => {
  const response = proxy(
    new NextRequest("https://simplecity.example/about?lang=en")
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.match(response.headers.get("x-middleware-request-cookie") || "", /simplecity_locale=en/);
  assert.equal(response.cookies.get("simplecity_locale")?.value, "en");
});

test("invalid language parameters are removed without setting a preference", () => {
  const response = proxy(
    new NextRequest("https://simplecity.example/decisions?lang=invalid")
  );

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://simplecity.example/decisions");
  assert.equal(response.cookies.get("simplecity_locale"), undefined);
});

test("static navigation pages discard irrelevant jurisdiction parameters", () => {
  for (const path of ["/about", "/subscribe"]) {
    const response = proxy(
      new NextRequest(`https://simplecity.example${path}?jurisdiction=san-mateo`)
    );
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get("location"), `https://simplecity.example${path}`, path);
  }
});

test("topic navigation keeps its jurisdiction parameter", () => {
  const response = proxy(
    new NextRequest(
      "https://simplecity.example/topics?jurisdiction=los-altos-school-district&lang=en"
    )
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});
