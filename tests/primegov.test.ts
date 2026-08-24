import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { BrowserContext, Page } from "playwright";
import {
  buildPrimeGovAttachmentIdentityUrl,
  buildDownloadFilename,
  isUsablePrimeGovHtmlAgendaText,
  limitPrimeGovMeetings,
  normalizePrimeGovItemDetailsUrl,
  normalizePrimeGovHtmlAgendaText,
  PORTAL_READY_SELECTOR,
  primeGovAttachmentDownloadDescriptor,
  resolvePrimeGovAttachmentDownloadUrl,
  scrapeHtmlAgendaText,
  waitForPortal
} from "@/lib/scraper/primegov";
import {
  downloadCompiledDocuments,
  downloadIqm2Documents,
  downloadOfficialSiteDocuments,
  isTransientOfficialDocumentError
} from "@/lib/scraper/downloadDocuments";
import {
  createStreamDownloadBudget,
  streamDownloadToTemp,
  STREAM_DOWNLOAD_HEADER_TIMEOUT_MS,
  STREAM_DOWNLOAD_IDLE_TIMEOUT_MS,
  STREAM_DOWNLOAD_MAX_FILE_BYTES,
  STREAM_DOWNLOAD_MAX_TOTAL_BYTES,
  STREAM_DOWNLOAD_MIN_FREE_BYTES,
  STREAM_DOWNLOAD_TOTAL_TIMEOUT_MS
} from "@/lib/scraper/streamDownload";
import type { PrimeGovMeeting } from "@/lib/types";

type Call = {
  method: string;
  args: unknown[];
};

function downloadTestContext(request?: unknown) {
  return {
    ...(request ? { request } : {}),
    cookies: async () => [],
    addCookies: async () => undefined,
    clearCookies: async () => undefined
  } as unknown as BrowserContext;
}

function fetchResponse(body: BodyInit, init: ResponseInit = {}) {
  return new Response(body, { status: 200, ...init });
}

function chunkedResponse(chunks: Array<string | Buffer>, init: ResponseInit = {}) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      controller.close();
    }
  }), { status: 200, ...init });
}

function primeGovAgendaText() {
  return normalizePrimeGovHtmlAgendaText(`
CITY OF EXAMPLE
CITY COUNCIL REGULAR MEETING AGENDA
Residents may submit comments to clerk@city.example before the meeting.
1. CALL TO ORDER
2. CONSENT CALENDAR
2.1 Library renovation contract
Recommendation: Approve the library renovation contract and authorize the city manager.
3. PUBLIC HEARING
3.1 Housing element update
Recommended action: Adopt the housing element update after receiving public testimony.
4. ADJOURNMENT
Accessibility accommodations are available by contacting the City Clerk.
`);
}

function primeGovMeeting(documents: PrimeGovMeeting["documents"] = []): PrimeGovMeeting {
  return {
    section: "Current And Upcoming Meetings",
    title: "City Council",
    dateText: "Jul 20, 2026",
    meetingType: "City Council",
    rowText: "City Council Jul 20, 2026",
    hasHtmlAgenda: documents.some((document) => document.type === "HTML Agenda"),
    hasPdf: documents.some((document) => document.url.includes("CompiledDocument")),
    documents
  };
}

test("waitForPortal waits for portal links instead of network idle", async () => {
  const calls: Call[] = [];
  const page = {
    goto: async (url: string, options: unknown) => {
      calls.push({ method: "goto", args: [url, options] });
      return null;
    },
    waitForLoadState: async (state: string, options: unknown) => {
      calls.push({ method: "waitForLoadState", args: [state, options] });
    },
    waitForSelector: async (selector: string, options: unknown) => {
      calls.push({ method: "waitForSelector", args: [selector, options] });
      return null;
    }
  } as unknown as Page;

  await waitForPortal(page, "https://city.example/public/portal");

  const gotoCall = calls.find((call) => call.method === "goto");
  const gotoOptions = gotoCall?.args[1] as { waitUntil?: string; timeout?: number };
  assert.equal(gotoCall?.args[0], "https://city.example/public/portal");
  assert.equal(gotoOptions.waitUntil, "domcontentloaded");
  assert.notEqual(gotoOptions.waitUntil, "networkidle");
  assert.equal(gotoOptions.timeout, 60000);

  const selectorCall = calls.find((call) => call.method === "waitForSelector");
  assert.equal(selectorCall?.args[0], PORTAL_READY_SELECTOR);
  assert.deepEqual(selectorCall?.args[1], { timeout: 60000 });
});

test("waitForPortal still waits for portal links if load state times out", async () => {
  const calls: Call[] = [];
  const page = {
    goto: async (url: string, options: unknown) => {
      calls.push({ method: "goto", args: [url, options] });
      return null;
    },
    waitForLoadState: async (state: string, options: unknown) => {
      calls.push({ method: "waitForLoadState", args: [state, options] });
      throw new Error("load state timed out");
    },
    waitForSelector: async (selector: string, options: unknown) => {
      calls.push({ method: "waitForSelector", args: [selector, options] });
      return null;
    }
  } as unknown as Page;

  await waitForPortal(page, "https://city.example/public/portal");

  assert.ok(calls.some((call) => call.method === "waitForSelector"));
});

test("PrimeGov HTML agenda extraction scopes to MeetingContents and preserves line structure", async () => {
  const selectors: string[] = [];
  let closed = false;
  const page = {
    goto: async () => null,
    waitForTimeout: async () => undefined,
    locator: (selector: string) => {
      selectors.push(selector);
      return { innerText: async () => primeGovAgendaText() };
    },
    close: async () => {
      closed = true;
    }
  } as unknown as Page;
  const context = {
    newPage: async () => page
  } as unknown as BrowserContext;
  const meeting = primeGovMeeting([
    {
      type: "HTML Agenda",
      label: "HTML Agenda",
      url: "https://city.primegov.com/Portal/Meeting?meetingTemplateId=1"
    }
  ]);

  const text = await scrapeHtmlAgendaText(context, meeting);

  assert.deepEqual(selectors, ["#MeetingContents"]);
  assert.match(text || "", /\n2\. CONSENT CALENDAR\n/);
  assert.doesNotMatch(text || "", /Select Language|Powered by Translate/);
  assert.equal(closed, true);
});

test("rejects long PrimeGov translation chrome without structured agenda lines", () => {
  const chrome = `Select Language ${"Abkhaz Acehnese Afrikaans Albanian Arabic ".repeat(30)} Powered by Translate`;
  assert.equal(isUsablePrimeGovHtmlAgendaText(chrome), false);
  assert.equal(isUsablePrimeGovHtmlAgendaText(primeGovAgendaText()), true);
});

test("applies the PrimeGov meeting limit before per-meeting work", () => {
  const meetings = [primeGovMeeting(), primeGovMeeting(), primeGovMeeting()];
  assert.equal(limitPrimeGovMeetings(meetings, 1).length, 1);
  assert.equal(limitPrimeGovMeetings(meetings).length, 3);
});

test("normalizes PrimeGov item URLs from direct and social sharing links", () => {
  const direct = "https://city.primegov.com/portal/item?meetingitemid=abc-123";
  assert.equal(normalizePrimeGovItemDetailsUrl(direct, "https://city.primegov.com"), direct);
  assert.equal(
    normalizePrimeGovItemDetailsUrl(
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(direct)}`,
      "https://city.primegov.com"
    ),
    direct
  );
  assert.equal(
    normalizePrimeGovItemDetailsUrl("https://city.primegov.com/Public/CompiledDocument?id=1", direct),
    null
  );
});

test("builds distinct filenames for PrimeGov item attachments", () => {
  const meeting = {
    section: "Archived Meetings",
    title: "Council",
    dateText: "Jul 20, 2026"
  } as PrimeGovMeeting;
  const first = buildDownloadFilename(
    meeting,
    "Staff Report",
    "https://pgwest.blob.core.windows.net/city/Items/25304/Attachments/4855/report.pdf?sig=one"
  );
  const second = buildDownloadFilename(
    meeting,
    "Staff Report",
    "https://pgwest.blob.core.windows.net/city/Items/25305/Attachments/4921/report.pdf?sig=two"
  );

  assert.notEqual(first, second);
  assert.match(first, /items-25304-attachments-4855-report-pdf$/);
});

test("keeps PrimeGov viewer URLs stable for identity and citations", () => {
  const identityUrl = buildPrimeGovAttachmentIdentityUrl({
    itemDetailsUrl: "https://city.primegov.com/portal/item?meetingitemid=item-1",
    previewUrl: "https://city.primegov.com/viewer/preview?type=2&uid=attachment-1&id=4921&token=temporary",
    attachmentId: "attachment-1"
  });

  assert.equal(
    identityUrl,
    "https://city.primegov.com/viewer/preview?id=4921&uid=attachment-1&type=2"
  );
  assert.deepEqual(primeGovAttachmentDownloadDescriptor(identityUrl || ""), {
    origin: "https://city.primegov.com",
    kind: "attachment",
    id: "attachment-1"
  });
});

test("builds a stable item-page identity when PrimeGov omits a preview link", () => {
  const identityUrl = buildPrimeGovAttachmentIdentityUrl({
    itemDetailsUrl: "https://city.primegov.com/portal/item?meetingitemid=item-1",
    documentId: "1214"
  });

  assert.equal(
    identityUrl,
    "https://city.primegov.com/portal/item?meetingitemid=item-1#primegov-document=1214"
  );
  assert.deepEqual(primeGovAttachmentDownloadDescriptor(identityUrl || ""), {
    origin: "https://city.primegov.com",
    kind: "document",
    id: "1214"
  });
});

test("does not trust a PrimeGov preview URL from another origin", () => {
  assert.equal(
    buildPrimeGovAttachmentIdentityUrl({
      itemDetailsUrl: "https://city.primegov.com/portal/item?meetingitemid=item-1",
      previewUrl: "https://untrusted.example/viewer/preview?id=1214&type=0",
      documentId: "1214"
    }),
    "https://city.primegov.com/portal/item?meetingitemid=item-1#primegov-document=1214"
  );
});

test("resolves a temporary PrimeGov URL only at download time", async () => {
  const stableUrl = "https://city.primegov.com/viewer/preview?id=1214&type=0";
  const signedUrl = "https://blob.example/report.pdf?sig=temporary";
  const requests: string[] = [];
  const context = {
    request: {
      get: async (url: string) => {
        requests.push(url);
        return {
          ok: () => true,
          json: async () => signedUrl
        };
      }
    }
  } as unknown as BrowserContext;

  assert.equal(await resolvePrimeGovAttachmentDownloadUrl(context, stableUrl), signedUrl);
  assert.deepEqual(requests, [
    "https://city.primegov.com/api/systemdocument/GetPublicPdfDownloadUrl/1214"
  ]);
  assert.equal(stableUrl, "https://city.primegov.com/viewer/preview?id=1214&type=0");
});

test("downloads PrimeGov attachments without replacing their stable source URL", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-primegov-"));
  const stableUrl = "https://city.primegov.com/viewer/preview?id=1214&type=0";
  const signedUrl = "https://blob.example/report.pdf?sig=temporary";
  const requests: string[] = [];
  const fetched: string[] = [];
  const context = downloadTestContext({
    get: async (url: string) => {
      requests.push(url);
      return {
        ok: () => true,
        json: async () => signedUrl
      };
    }
  });
  const meeting = {
    section: "Archived Meetings",
    title: "Council",
    dateText: "Jul 20, 2026",
    meetingType: "Council",
    rowText: "Council",
    hasHtmlAgenda: true,
    hasPdf: true,
    documents: [{
      type: "Staff Report" as const,
      label: "Staff Report",
      url: stableUrl,
      isAgendaItemAttachment: true
    }]
  } as PrimeGovMeeting;

  try {
    const result = await downloadCompiledDocuments(context, [meeting], {
      outputDir,
      minFreeBytes: 0,
      fetchImpl: (async (url) => {
        fetched.push(String(url));
        return fetchResponse("%PDF-test", {
          headers: { "content-type": "application/pdf" }
        });
      }) as typeof fetch
    });
    assert.deepEqual(result, { downloaded: 1, failed: 0 });
    assert.deepEqual(requests, [
      "https://city.primegov.com/api/systemdocument/GetPublicPdfDownloadUrl/1214"
    ]);
    assert.deepEqual(fetched, [signedUrl]);
    assert.equal(meeting.documents[0].url, stableUrl);
    assert.equal(meeting.documents[0].downloadError, null);
    assert.ok(meeting.documents[0].localPath?.startsWith(outputDir));
    assert.equal(await fs.readFile(meeting.documents[0].localPath || "", "utf8"), "%PDF-test");
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("uses bounded large-file streaming safety defaults", () => {
  assert.equal(STREAM_DOWNLOAD_MAX_FILE_BYTES, 1024 * 1024 * 1024);
  assert.equal(STREAM_DOWNLOAD_MAX_TOTAL_BYTES, 4 * 1024 * 1024 * 1024);
  assert.equal(STREAM_DOWNLOAD_MIN_FREE_BYTES, 2 * 1024 * 1024 * 1024);
  assert.equal(STREAM_DOWNLOAD_HEADER_TIMEOUT_MS, 60_000);
  assert.equal(STREAM_DOWNLOAD_IDLE_TIMEOUT_MS, 60_000);
  assert.equal(STREAM_DOWNLOAD_TOTAL_TIMEOUT_MS, 10 * 60_000);
});

test("does not reject PrimeGov documents at the former 100, 50, or 10 MiB caps", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-primegov-cap-"));
  const legacyCaps = [100, 50, 10].map((mib) => mib * 1024 * 1024);
  const context = downloadTestContext();
  const meeting = primeGovMeeting([
    {
      type: "Agenda",
      label: "Agenda",
      url: "https://city.primegov.com/Public/CompiledDocument?id=agenda",
      bytes: legacyCaps[0] + 1
    },
    {
      type: "Packet",
      label: "Packet",
      url: "https://city.primegov.com/Public/CompiledDocument?id=packet",
      bytes: legacyCaps[1] + 1
    },
    {
      type: "Attachment",
      label: "Attachment",
      url: "https://city.primegov.com/Public/CompiledDocument?id=attachment",
      bytes: legacyCaps[2] + 1
    }
  ]);

  try {
    let fetchIndex = 0;
    const result = await downloadCompiledDocuments(context, [meeting], {
      outputDir,
      minFreeBytes: 0,
      fetchImpl: (async () => fetchResponse("%PDF-test", {
        headers: { "content-length": String(legacyCaps[fetchIndex++] + 1) }
      })) as typeof fetch
    });
    assert.deepEqual(result, { downloaded: 3, failed: 0 });
    assert.equal(fetchIndex, 3);
    assert.ok(meeting.documents.every((document) => document.downloadError === null));
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("does not reject IQM2 documents at the former 50 MiB cap", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-iqm2-cap-"));
  const context = downloadTestContext();
  const meeting = primeGovMeeting([
    {
      type: "Document",
      label: "Attachment A",
      url: "https://city.iqm2.com/Citizens/FileOpen.aspx?Type=4&ID=123"
    }
  ]);

  try {
    const result = await downloadIqm2Documents(context, [meeting], {
      outputDir,
      minFreeBytes: 0,
      fetchImpl: (async () => fetchResponse("%PDF-test", {
        headers: { "content-length": String(50 * 1024 * 1024 + 1) }
      })) as typeof fetch
    });
    assert.deepEqual(result, { downloaded: 1, failed: 0 });
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("streams unknown-length bodies within an explicit lower cap and preserves prior files", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-primegov-body-cap-"));
  const context = downloadTestContext();
  const meeting = primeGovMeeting([
    {
      type: "Agenda",
      label: "Agenda",
      url: "https://city.primegov.com/Public/CompiledDocument?id=agenda"
    }
  ]);
  const filename = buildDownloadFilename(
    meeting,
    meeting.documents[0].type,
    meeting.documents[0].url
  );
  const finalPath = path.join(outputDir, `${filename}.pdf`);
  const budget = createStreamDownloadBudget(1000);

  try {
    await fs.writeFile(finalPath, "prior-complete-file", "utf8");
    const result = await downloadCompiledDocuments(context, [meeting], {
      outputDir,
      maxBytes: 8,
      minFreeBytes: 0,
      downloadBudget: budget,
      fetchImpl: (async () => fetchResponse("%PDF-more-than-eight-bytes")) as typeof fetch
    });
    assert.deepEqual(result, { downloaded: 0, failed: 1 });
    assert.equal(meeting.documents[0].localPath, null);
    assert.match(meeting.documents[0].downloadError || "", /8-byte absolute safety limit/);
    assert.ok(budget.usedBytes > 8, "failed transfers must consume the invocation budget");
    assert.equal(await fs.readFile(finalPath, "utf8"), "prior-complete-file");
    assert.ok((await fs.readdir(outputDir)).every((name) => !name.endsWith(".part")));
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("validates redirects, carries browser cookies, and strips credentials cross-origin", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-stream-redirect-"));
  const targetPath = path.join(outputDir, "agenda.pdf");
  const cookieJar: Array<Record<string, unknown>> = [{
    name: "initial",
    value: "one",
    domain: "city.example",
    path: "/",
    expires: -1
  }];
  const context = {
    cookies: async (url: string) => {
      const hostname = new URL(url).hostname;
      return cookieJar.filter((cookie) => cookie.domain === hostname);
    },
    addCookies: async (cookies: Array<Record<string, unknown>>) => {
      for (const cookie of cookies) {
        const storedCookie = { expires: -1, ...cookie };
        const index = cookieJar.findIndex(
          (entry) => entry.name === cookie.name && entry.domain === cookie.domain
        );
        if (index >= 0) cookieJar[index] = storedCookie;
        else cookieJar.push(storedCookie);
      }
    },
    clearCookies: async () => undefined
  } as unknown as BrowserContext;
  const seenUrls: string[] = [];
  const validatedUrls: string[] = [];

  try {
    const streamed = await streamDownloadToTemp(
      context,
      "https://city.example/start",
      targetPath,
      {
        headers: { Authorization: "Bearer secret", Cookie: "explicit=secret" },
        minFreeBytes: 0,
        validateUrl: (url) => {
          validatedUrls.push(url);
          return true;
        },
        fetchImpl: (async (url, init) => {
          const requestUrl = String(url);
          const headers = new Headers(init?.headers);
          seenUrls.push(requestUrl);

          if (requestUrl.endsWith("/start")) {
            assert.equal(headers.get("authorization"), "Bearer secret");
            assert.equal(headers.get("cookie"), "initial=one");
            return new Response(null, {
              status: 302,
              headers: {
                location: "/signed",
                "set-cookie": "redirected=two; Path=/; HttpOnly"
              }
            });
          }
          if (requestUrl.endsWith("/signed")) {
            assert.equal(headers.get("authorization"), "Bearer secret");
            assert.match(headers.get("cookie") || "", /initial=one/);
            assert.match(headers.get("cookie") || "", /redirected=two/);
            return new Response(null, {
              status: 302,
              headers: { location: "https://cdn.example/file.pdf" }
            });
          }

          assert.equal(headers.get("authorization"), null);
          assert.equal(headers.get("cookie"), null);
          return fetchResponse("%PDF-streamed");
        }) as typeof fetch
      }
    );
    try {
      await streamed.commit(targetPath);
    } finally {
      await streamed.cleanup();
    }

    assert.deepEqual(seenUrls, [
      "https://city.example/start",
      "https://city.example/signed",
      "https://cdn.example/file.pdf"
    ]);
    assert.ok(validatedUrls.includes("https://cdn.example/file.pdf"));
    assert.equal(await fs.readFile(targetPath, "utf8"), "%PDF-streamed");
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("writes unknown-length multi-chunk bodies exactly and commits without a part file", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-stream-chunks-"));
  const targetPath = path.join(outputDir, "agenda.pdf");
  const chunks = ["%P", "DF-", Buffer.alloc(5_000, "x")];
  const expected = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));

  try {
    await fs.writeFile(targetPath, "prior file", "utf8");
    const streamed = await streamDownloadToTemp(null, "https://city.example/agenda.pdf", targetPath, {
      minFreeBytes: 0,
      fetchImpl: (async () => chunkedResponse(chunks)) as typeof fetch
    });
    assert.equal(streamed.bytes, expected.length);
    assert.deepEqual(streamed.prefix, expected.subarray(0, 4096));
    assert.equal(await fs.readFile(targetPath, "utf8"), "prior file");
    try {
      await streamed.commit(targetPath);
    } finally {
      await streamed.cleanup();
    }

    assert.deepEqual(await fs.readFile(targetPath), expected);
    assert.ok((await fs.readdir(outputDir)).every((name) => !name.endsWith(".part")));
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("starts consuming a response before asynchronously synchronizing its cookies", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-stream-backpressure-"));
  const targetPath = path.join(outputDir, "agenda.pdf");
  const events: string[] = [];
  let bodyStarted = false;
  const context = {
    cookies: async () => [],
    addCookies: async () => {
      events.push("cookie");
      assert.equal(bodyStarted, true, "response cookies must wait until the body is drained");
    },
    clearCookies: async () => undefined
  } as unknown as BrowserContext;

  try {
    const streamed = await streamDownloadToTemp(
      context,
      "https://city.example/agenda.pdf",
      targetPath,
      {
        minFreeBytes: 0,
        statfsImpl: async () => {
          events.push("statfs");
          return { bavail: STREAM_DOWNLOAD_MAX_FILE_BYTES, bsize: 2 };
        },
        fetchImpl: (async () => {
          events.push("fetch");
          return new Response(new ReadableStream<Uint8Array>({
            pull(controller) {
              bodyStarted = true;
              events.push("body");
              controller.enqueue(Buffer.from("%PDF-backpressure-safe"));
              controller.close();
            }
          }, { highWaterMark: 0 }), {
            headers: { "set-cookie": "session=updated; Path=/; HttpOnly" }
          });
        }) as typeof fetch
      }
    );
    try {
      await streamed.commit(targetPath);
    } finally {
      await streamed.cleanup();
    }

    assert.deepEqual(events, ["statfs", "fetch", "body", "cookie"]);
    assert.equal(await fs.readFile(targetPath, "utf8"), "%PDF-backpressure-safe");
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("stops before reading a body when disk reserve or invocation budget is exhausted", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-stream-precheck-"));
  let bodyPulls = 0;
  const unreadResponse = () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        bodyPulls += 1;
        controller.enqueue(Buffer.from("%PDF-body"));
        controller.close();
      }
    },
    { highWaterMark: 0 }
  ));

  try {
    await assert.rejects(
      streamDownloadToTemp(null, "https://city.example/disk.pdf", path.join(outputDir, "disk.pdf"), {
        fetchImpl: (async () => unreadResponse()) as typeof fetch,
        statfsImpl: async () => ({ bavail: STREAM_DOWNLOAD_MIN_FREE_BYTES, bsize: 1 })
      }),
      /disk reserve/
    );
    assert.equal(bodyPulls, 0);

    const budget = createStreamDownloadBudget(8);
    budget.usedBytes = 8;
    await assert.rejects(
      streamDownloadToTemp(null, "https://city.example/budget.pdf", path.join(outputDir, "budget.pdf"), {
        budget,
        minFreeBytes: 0,
        fetchImpl: (async () => unreadResponse()) as typeof fetch
      }),
      /invocation safety limit/
    );
    assert.equal(bodyPulls, 0);
    assert.ok((await fs.readdir(outputDir)).every((name) => !name.endsWith(".part")));
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("cleans partial files after idle, total, and shouldStop aborts", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-stream-abort-"));
  const stalledResponse = () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Buffer.from("%PDF-partial"));
    }
  }));

  try {
    await assert.rejects(
      streamDownloadToTemp(null, "https://city.example/idle.pdf", path.join(outputDir, "idle.pdf"), {
        minFreeBytes: 0,
        idleTimeoutMs: 10,
        totalTimeoutMs: 100,
        fetchImpl: (async () => stalledResponse()) as typeof fetch
      }),
      /no progress for 10ms/
    );

    await assert.rejects(
      streamDownloadToTemp(null, "https://city.example/total.pdf", path.join(outputDir, "total.pdf"), {
        minFreeBytes: 0,
        idleTimeoutMs: 100,
        totalTimeoutMs: 10,
        fetchImpl: (async () => stalledResponse()) as typeof fetch
      }),
      /timed out after 10ms/
    );

    let stop = false;
    const stoppingResponse = () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        stop = true;
        controller.enqueue(Buffer.from("%PDF-partial"));
      }
    }));
    await assert.rejects(
      streamDownloadToTemp(null, "https://city.example/stop.pdf", path.join(outputDir, "stop.pdf"), {
        minFreeBytes: 0,
        shouldStop: () => stop,
        fetchImpl: (async () => stoppingResponse()) as typeof fetch
      }),
      /pipeline deadline is near/
    );

    assert.deepEqual(await fs.readdir(outputDir), []);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("does not allow callers to raise the absolute one GiB file limit", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-stream-absolute-"));
  const targetPath = path.join(outputDir, "agenda.pdf");

  try {
    await assert.rejects(
      streamDownloadToTemp(null, "https://city.example/agenda.pdf", targetPath, {
        maxFileBytes: STREAM_DOWNLOAD_MAX_FILE_BYTES * 2,
        minFreeBytes: 0,
        fetchImpl: (async () => fetchResponse("unused", {
          headers: { "content-length": String(STREAM_DOWNLOAD_MAX_FILE_BYTES + 1) }
        })) as typeof fetch
      }),
      /1073741824-byte absolute safety limit/
    );
    assert.ok((await fs.readdir(outputDir)).every((name) => !name.endsWith(".part")));
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("uses a strict official text fallback after primary HTTP failure", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-official-fallback-"));
  const documentUrl = "https://city.example/agenda";
  const fallbackUrl = "https://city.example/agenda/plain-text";
  const officialText =
    "City Council agenda item 4: approve the audited capital improvement agreement.";
  const meeting = primeGovMeeting([
    { type: "Agenda", label: "Agenda", url: documentUrl }
  ]);

  try {
    const result = await downloadOfficialSiteDocuments(downloadTestContext(), [meeting], {
      outputDir,
      minFreeBytes: 0,
      plainTextFallbackUrl: () => fallbackUrl,
      validateFinalUrl: (url) => new URL(url).hostname === "city.example",
      fetchImpl: (async (url) => String(url) === documentUrl
        ? new Response("temporarily unavailable", { status: 503 })
        : fetchResponse(JSON.stringify({ plainText: officialText }), {
            headers: { "content-type": "application/json" }
          })) as typeof fetch
    });

    assert.deepEqual(result, { downloaded: 1, failed: 0 });
    assert.equal(meeting.documents[0].extractedText, officialText);
    assert.equal(meeting.documents[0].downloadError, null);
    assert.equal(await fs.readFile(meeting.documents[0].localPath || "", "utf8"), officialText);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("uses the official text fallback when a downloaded CivicClerk PDF is unreadable", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-unreadable-pdf-"));
  const documentUrl = "https://city.example/agenda.pdf";
  const fallbackUrl = "https://city.example/agenda.txt";
  const officialText =
    "City Council agenda item 8: approve the official affordable housing agreement.";
  const meeting = primeGovMeeting([
    { type: "Agenda", label: "Agenda", url: documentUrl }
  ]);

  try {
    const result = await downloadOfficialSiteDocuments(downloadTestContext(), [meeting], {
      outputDir,
      minFreeBytes: 0,
      validatePdfTextBeforeAccept: true,
      plainTextFallbackUrl: () => fallbackUrl,
      fetchImpl: (async (url) => String(url) === documentUrl
        ? fetchResponse("%PDF-not-a-readable-test-document")
        : fetchResponse(JSON.stringify({ plainText: officialText }), {
            headers: { "content-type": "application/json" }
          })) as typeof fetch
    });

    assert.deepEqual(result, { downloaded: 1, failed: 0 });
    assert.equal(meeting.documents[0].extractedText, officialText);
    assert.equal(meeting.documents[0].downloadError, null);
    assert.ok(meeting.documents[0].localPath?.endsWith(".txt"));
    assert.equal((await fs.readdir(outputDir)).some((name) => name.endsWith(".pdf")), false);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("retries transient official-document transport failures before marking ingestion incomplete", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-official-retry-"));
  const documentUrl = "https://city.example/agenda.pdf";
  const meeting = primeGovMeeting([{ type: "Agenda", label: "Agenda", url: documentUrl }]);
  let attempts = 0;

  try {
    const result = await downloadOfficialSiteDocuments(downloadTestContext(), [meeting], {
      outputDir,
      minFreeBytes: 0,
      fetchImpl: (async () => {
        attempts += 1;
        if (attempts < 3) throw new TypeError("fetch failed");
        return fetchResponse("%PDF-1.7\nOfficial agenda content");
      }) as typeof fetch
    });

    assert.deepEqual(result, { downloaded: 1, failed: 0 });
    assert.equal(attempts, 3);
    assert.equal(meeting.documents[0].downloadError, null);
    assert.ok(meeting.documents[0].localPath?.endsWith(".pdf"));
    assert.equal(isTransientOfficialDocumentError(new Error("fetch failed")), true);
    assert.equal(isTransientOfficialDocumentError(new Error("HTTP 404")), false);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("retries transient PrimeGov compiled-document failures", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-primegov-retry-"));
  const documentUrl = "https://city.primegov.com/Public/CompiledDocument/42";
  const meeting = primeGovMeeting([
    { type: "Agenda", label: "Agenda", url: documentUrl }
  ]);
  let attempts = 0;

  try {
    const result = await downloadCompiledDocuments(downloadTestContext(), [meeting], {
      outputDir,
      minFreeBytes: 0,
      retryDelayMs: 0,
      fetchImpl: (async () => {
        attempts += 1;
        if (attempts < 3) throw new TypeError("fetch failed");
        return fetchResponse("%PDF-1.7\nOfficial agenda content");
      }) as typeof fetch
    });

    assert.deepEqual(result, { downloaded: 1, failed: 0 });
    assert.equal(attempts, 3);
    assert.equal(meeting.documents[0].downloadError, null);
    assert.ok(meeting.documents[0].localPath?.endsWith(".pdf"));
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("does not retry a permanently missing PrimeGov compiled document", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-primegov-missing-"));
  const documentUrl = "https://city.primegov.com/Public/CompiledDocument/43";
  const meeting = primeGovMeeting([
    { type: "Agenda", label: "Agenda", url: documentUrl }
  ]);
  let attempts = 0;

  try {
    const result = await downloadCompiledDocuments(downloadTestContext(), [meeting], {
      outputDir,
      minFreeBytes: 0,
      retryDelayMs: 0,
      fetchImpl: (async () => {
        attempts += 1;
        return new Response("missing", { status: 404 });
      }) as typeof fetch
    });

    assert.deepEqual(result, { downloaded: 0, failed: 1 });
    assert.equal(attempts, 1);
    assert.match(String(meeting.documents[0].downloadError), /HTTP 404/);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("allows a source to use additional delayed retries and browser-like headers", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-source-retries-"));
  const documentUrl = "https://city.example/agenda.pdf";
  const meeting = primeGovMeeting([{ type: "Agenda", label: "Agenda", url: documentUrl }]);
  let attempts = 0;

  try {
    const result = await downloadOfficialSiteDocuments(downloadTestContext(), [meeting], {
      outputDir,
      minFreeBytes: 0,
      downloadAttempts: 5,
      retryDelayMs: 0,
      requestHeaders: { Accept: "application/pdf", Connection: "close" },
      fetchImpl: (async (_url, init) => {
        attempts += 1;
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("accept"), "application/pdf");
        assert.equal(headers.get("connection"), "close");
        if (attempts < 5) throw new TypeError("fetch failed");
        return fetchResponse("%PDF-1.7\nOfficial agenda content");
      }) as typeof fetch
    });

    assert.deepEqual(result, { downloaded: 1, failed: 0 });
    assert.equal(attempts, 5);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("uses the official text fallback after the primary file safety guard rejects", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-official-cap-fallback-"));
  const documentUrl = "https://city.example/oversized-agenda";
  const fallbackUrl = "https://city.example/oversized-agenda/plain-text";
  const officialText =
    "City Council agenda item 7: adopt the final official transportation program.";
  const meeting = primeGovMeeting([
    { type: "Agenda", label: "Agenda", url: documentUrl }
  ]);

  try {
    const result = await downloadOfficialSiteDocuments(downloadTestContext(), [meeting], {
      outputDir,
      minFreeBytes: 0,
      plainTextFallbackUrl: () => fallbackUrl,
      fetchImpl: (async (url) => String(url) === documentUrl
        ? fetchResponse("not consumed", {
            headers: { "content-length": String(STREAM_DOWNLOAD_MAX_FILE_BYTES + 1) }
          })
        : fetchResponse(officialText, {
            headers: { "content-type": "text/plain; charset=utf-8" }
          })) as typeof fetch
    });

    assert.deepEqual(result, { downloaded: 1, failed: 0 });
    assert.equal(meeting.documents[0].extractedText, officialText);
    assert.equal(meeting.documents[0].downloadError, null);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("rejects challenge HTML and invalid text fallback without retaining response files", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-official-challenge-"));
  const documentUrl = "https://city.example/minutes";
  const fallbackUrl = "https://city.example/minutes/plain-text";
  const meeting = primeGovMeeting([
    { type: "Minutes", label: "Minutes", url: documentUrl }
  ]);

  try {
    const result = await downloadOfficialSiteDocuments(downloadTestContext(), [meeting], {
      outputDir,
      minFreeBytes: 0,
      plainTextFallbackUrl: () => fallbackUrl,
      fetchImpl: (async (url) => String(url) === documentUrl
        ? fetchResponse("<html><body>Access denied. Verify you are human before continuing.</body></html>", {
            headers: { "content-type": "text/html" }
          })
        : fetchResponse("Access denied. Verify you are human before continuing to official minutes.", {
            headers: { "content-type": "text/plain" }
          })) as typeof fetch
    });

    assert.deepEqual(result, { downloaded: 0, failed: 1 });
    assert.equal(meeting.documents[0].localPath, null);
    assert.match(meeting.documents[0].downloadError || "", /Primary document failed/);
    assert.match(meeting.documents[0].downloadError || "", /Plain-text fallback failed/);
    assert.deepEqual(await fs.readdir(outputDir), []);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("rejects IQM2 challenge HTML without retaining an orphan diagnostic", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-iqm2-challenge-"));
  const meeting = primeGovMeeting([{
    type: "Minutes",
    label: "Minutes",
    url: "https://city.iqm2.com/Citizens/FileOpen.aspx?Type=12&ID=123"
  }]);

  try {
    const result = await downloadIqm2Documents(downloadTestContext(), [meeting], {
      outputDir,
      minFreeBytes: 0,
      fetchImpl: (async () => fetchResponse(
        "<html><body>Access denied. Checking your browser before continuing.</body></html>",
        { headers: { "content-type": "text/html" } }
      )) as typeof fetch
    });
    assert.deepEqual(result, { downloaded: 0, failed: 1 });
    assert.equal(meeting.documents[0].localPath, null);
    assert.match(meeting.documents[0].downloadError || "", /unusable HTML/);
    assert.deepEqual(await fs.readdir(outputDir), []);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("does not download a PrimeGov packet when structured HTML agenda text is available", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-primegov-html-"));
  let requestCalls = 0;
  const context = {
    request: {
      head: async () => {
        requestCalls += 1;
        throw new Error("Packet request should be skipped");
      },
      get: async () => {
        requestCalls += 1;
        throw new Error("Packet request should be skipped");
      }
    }
  } as unknown as BrowserContext;
  const meeting = primeGovMeeting([
    {
      type: "HTML Agenda",
      label: "HTML Agenda",
      url: "https://city.primegov.com/Portal/Meeting?meetingTemplateId=1"
    },
    {
      type: "Packet",
      label: "Packet",
      url: "https://city.primegov.com/Public/CompiledDocument?id=packet"
    }
  ]);
  meeting.htmlAgendaText = primeGovAgendaText();

  try {
    const result = await downloadCompiledDocuments(context, [meeting], { outputDir });
    assert.deepEqual(result, { downloaded: 0, failed: 0 });
    assert.equal(requestCalls, 0);
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});
