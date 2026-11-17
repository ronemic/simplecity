import assert from "node:assert/strict";
import test from "node:test";
import { fetchEscribeDocument, withEscribeDocumentFallback } from "@/lib/scraper/escribeDocumentFetch";

test("retries an unresolved browser challenge with the bounded official document fetcher", async () => {
  const url = "https://pub-santamaria.escribemeetings.com/FileStream.ashx?DocumentId=15193";
  let calls = 0;
  const fetcher = withEscribeDocumentFallback(async () => {
    throw new Error("Cloudflare browser challenge was not resolved; run eSCRIBE with --headful.");
  }, () => undefined, async (target, init) => {
    calls += 1;
    assert.equal(target, url);
    assert.ok(init?.signal);
    return new Response("%PDF-official", { headers: { "content-type": "application/pdf" } });
  });
  const response = await fetcher(url, { signal: new AbortController().signal });
  assert.equal(await response.text(), "%PDF-official");
  assert.equal(calls, 1);
});

test("does not retry ordinary failures or aborted downloads with the alternate transport", async () => {
  let calls = 0;
  const fallback = async () => { calls += 1; return new Response("unexpected"); };
  const ordinary = withEscribeDocumentFallback(async () => { throw new Error("connection failed"); }, () => undefined, fallback);
  await assert.rejects(ordinary("https://example.com"), /connection failed/);
  const aborted = withEscribeDocumentFallback(async () => { throw new Error("Cloudflare browser challenge was not resolved"); }, () => undefined, fallback);
  await assert.rejects(aborted("https://example.com", { signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});

test("alternate transport rejects unofficial and non-document URLs before spawning Python", async () => {
  for (const url of ["https://example.com/FileStream.ashx", "http://pub-santamaria.escribemeetings.com/FileStream.ashx", "https://pub-santamaria.escribemeetings.com/Meeting.aspx"]) {
    await assert.rejects(fetchEscribeDocument(url), /Only official eSCRIBE/);
  }
});
