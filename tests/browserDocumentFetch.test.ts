import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Page } from "playwright";
import { createBrowserDocumentFetch } from "@/lib/scraper/browserDocumentFetch";
import { streamDownloadToTemp } from "@/lib/scraper/streamDownload";

// Execute the browser callbacks with real Web streams and AbortControllers;
// only the Playwright handle boundary and remote server are substituted.
function pageHarness() {
  const handles = new Set<object>();
  function handle(value: unknown) {
    const result = {
      value,
      evaluate: async (fn: (value: unknown) => unknown) => fn(value),
      dispose: async () => { handles.delete(result); }
    };
    handles.add(result);
    return result;
  }
  const page = {
    url: () => "https://city.example/",
    evaluateHandle: async (fn: (arg: unknown) => unknown, arg?: Record<string, unknown>) => {
      const resolved = arg && Object.fromEntries(Object.entries(arg).map(([key, value]) => [
        key, value && typeof value === "object" && "value" in value ? value.value : value
      ]));
      return handle(await fn(resolved));
    }
  } as unknown as Page;
  return { fetch: createBrowserDocumentFetch(page, page.url()), handles };
}

test("browser transport streams binary chunks and leaves cookies to the browser", async (t) => {
  const bytes = Buffer.alloc(180_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.redirect, "error");
    assert.deepEqual(init.headers, { Accept: "application/pdf" });
    return new Response(bytes, { headers: { "content-type": "application/pdf" } });
  });
  const browser = pageHarness();
  const result = await browser.fetch("https://city.example/FileStream.ashx?DocumentId=1", {
    headers: { Accept: "application/pdf", Cookie: "must-not-be-forwarded", "User-Agent": "Node" }
  });
  assert.equal(result.headers.get("content-type"), "application/pdf");
  const reader = result.body!.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    assert.ok(chunk.value.byteLength <= 64 * 1024);
    chunks.push(chunk.value);
  }
  assert.deepEqual(Buffer.concat(chunks), bytes);
  // EOF cleanup completes just after the stream's final read resolves.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(browser.handles.size, 0);
});

test("browser transport rejects off-origin requests before making a request", async (t) => {
  const remote = t.mock.method(globalThis, "fetch", async () => new Response());
  const browser = pageHarness();
  await assert.rejects(browser.fetch("https://other.example/file.pdf"), /official portal origin/);
  assert.equal(remote.mock.callCount(), 0);
  assert.equal(browser.handles.size, 0);
});

test("browser transport preserves HTTP failures and cleans cancelled response handles", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("challenge", { status: 403 }));
  const browser = pageHarness();
  const result = await browser.fetch("https://city.example/file.pdf");
  assert.equal(result.status, 403);
  await result.body!.cancel();
  assert.equal(browser.handles.size, 0);
});

test("browser transport aborts requests waiting for headers", async (t) => {
  t.mock.method(globalThis, "fetch", (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  }));
  const browser = pageHarness();
  const controller = new AbortController();
  const result = browser.fetch("https://city.example/file.pdf", { signal: controller.signal });
  setImmediate(() => controller.abort(new Error("test deadline")));
  await assert.rejects(result, /test deadline/);
  assert.equal(browser.handles.size, 0);
});

test("browser transport aborts stalled body reads and frees handles", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => new Response(
    new ReadableStream({ start(stream) {
      init.signal!.addEventListener("abort", () => stream.error(init.signal!.reason), { once: true });
    } })
  ));
  const browser = pageHarness();
  const controller = new AbortController();
  const result = await browser.fetch("https://city.example/file.pdf", { signal: controller.signal });
  const body = result.arrayBuffer();
  setImmediate(() => controller.abort(new Error("idle deadline")));
  await assert.rejects(body, /idle deadline/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(browser.handles.size, 0);
});

test("browser downloads retain the streaming byte limit and remove partial files", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(Buffer.alloc(200_000)));
  const browser = pageHarness();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-download-test-"));
  try {
    await assert.rejects(streamDownloadToTemp(null, "https://city.example/file.pdf", path.join(dir, "file.pdf"), {
      fetchImpl: browser.fetch, maxFileBytes: 100_000, minFreeBytes: 0
    }), /safety limit/);
    assert.deepEqual(await fs.readdir(dir), []);
    assert.equal(browser.handles.size, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
