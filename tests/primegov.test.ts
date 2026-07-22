import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { BrowserContext, Page } from "playwright";
import {
  buildPrimeGovAttachmentIdentityUrl,
  buildDownloadFilename,
  normalizePrimeGovItemDetailsUrl,
  PORTAL_READY_SELECTOR,
  primeGovAttachmentDownloadDescriptor,
  resolvePrimeGovAttachmentDownloadUrl,
  waitForPortal
} from "@/lib/scraper/primegov";
import { downloadCompiledDocuments } from "@/lib/scraper/downloadDocuments";
import type { PrimeGovMeeting } from "@/lib/types";

type Call = {
  method: string;
  args: unknown[];
};

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
  const context = {
    request: {
      get: async (url: string) => {
        requests.push(url);
        if (url.includes("/api/systemdocument/")) {
          return {
            ok: () => true,
            json: async () => signedUrl
          };
        }
        return {
          ok: () => true,
          body: async () => Buffer.from("%PDF-test")
        };
      }
    }
  } as unknown as BrowserContext;
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
    const result = await downloadCompiledDocuments(context, [meeting], { outputDir });
    assert.deepEqual(result, { downloaded: 1, failed: 0 });
    assert.deepEqual(requests, [
      "https://city.primegov.com/api/systemdocument/GetPublicPdfDownloadUrl/1214",
      signedUrl
    ]);
    assert.equal(meeting.documents[0].url, stableUrl);
    assert.equal(meeting.documents[0].downloadError, null);
    assert.ok(meeting.documents[0].localPath?.startsWith(outputDir));
    assert.equal(await fs.readFile(meeting.documents[0].localPath || "", "utf8"), "%PDF-test");
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});
