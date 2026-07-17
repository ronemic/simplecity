import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

test("admin pages and APIs use the normal missing-page route", () => {
  for (const path of [
    "/admin",
    "/admin/cards",
    "/api/admin/login",
    "/api/admin/cards",
    "/api/summarize"
  ]) {
    const response = middleware(new NextRequest(`https://simplecity.example${path}`));
    assert.equal(
      response.headers.get("x-middleware-rewrite"),
      "https://simplecity.example/__simplecity_not_found__",
      path
    );
  }
});

test("public routes still pass through middleware", () => {
  const response = middleware(new NextRequest("https://simplecity.example/decisions"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});
