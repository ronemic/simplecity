import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { BrowserContext, Download, Page } from "playwright";
import { getJurisdictionBySlug } from "@/lib/config/jurisdictions";
import {
  attachLaserficheMinutes,
  downloadLaserficheMinutes,
  normalizeAgendaOnlineItemLink,
  normalizeAgendaOnlineRows,
  openAgendaOnlineMeetingRows
} from "@/lib/sources/agenda-online";
import type { PrimeGovMeeting } from "@/lib/types";

test("normalizes Redwood City Agenda Online rows and document types", () => {
  const jurisdiction = getJurisdictionBySlug("redwood-city");
  assert.ok(jurisdiction);

  const meetings = normalizeAgendaOnlineRows([
    {
      meetingId: "2716",
      title: "July 13, 2026 Regular City Council Meeting",
      bodyName: "City Council",
      dateText: "7/13/2026 6:00:00 PM",
      rowText: "July 13, 2026 Regular City Council Meeting City Council",
      detailsUrl: "https://meetings.redwoodcity.org/AgendaOnline/Meetings/ViewMeeting?id=2716&doctype=1",
      documents: [
        {
          label: "Download",
          url: "https://meetings.redwoodcity.org/AgendaOnline/Documents/Downloadfile/agenda.pdf?documentType=1&meetingId=2716"
        },
        {
          label: "Download",
          url: "https://meetings.redwoodcity.org/AgendaOnline/Documents/Downloadfile/packet.pdf?documentType=5&meetingId=2716&isAttachment=True"
        }
      ]
    }
  ], jurisdiction, new Date("2026-07-12T12:00:00-07:00").getTime());

  assert.equal(meetings.length, 1);
  assert.equal(meetings[0].externalId, "redwood-city-agenda-online-2716");
  assert.equal(meetings[0].status, "Upcoming");
  assert.deepEqual(meetings[0].documents.map((document) => document.type), ["Agenda", "Agenda Packet"]);
});

test("retries a transient empty Agenda Online landing page", async () => {
  let navigations = 0;
  let waits = 0;
  const logs: string[] = [];
  const page = {
    goto: async () => {
      navigations += 1;
      return { status: () => 200, ok: () => true };
    },
    waitForFunction: async () => {
      waits += 1;
      if (waits === 1) throw new Error("meeting rows timed out");
    },
    title: async () => "Redwood City Agenda Online",
    url: () => "https://meetings.redwoodcity.org/AgendaOnline/"
  } as unknown as Page;

  await openAgendaOnlineMeetingRows(
    page,
    "https://meetings.redwoodcity.org/AgendaOnline/",
    (message) => logs.push(message),
    { attempts: 3, timeoutMs: 10, retryDelayMs: 0 }
  );

  assert.equal(navigations, 2);
  assert.equal(waits, 2);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /attempt 1\/3.*HTTP 200.*retrying/);
});

test("reports Agenda Online landing-page diagnostics after bounded retries", async () => {
  let navigations = 0;
  const page = {
    goto: async () => {
      navigations += 1;
      return { status: () => 503, ok: () => false };
    },
    waitForFunction: async () => {
      throw new Error("meeting rows timed out");
    },
    title: async () => "Service unavailable",
    url: () => "https://meetings.redwoodcity.org/AgendaOnline/"
  } as unknown as Page;

  await assert.rejects(
    openAgendaOnlineMeetingRows(
      page,
      "https://meetings.redwoodcity.org/AgendaOnline/",
      () => undefined,
      { attempts: 2, timeoutMs: 10, retryDelayMs: 0 }
    ),
    /did not load after 2 attempts: Agenda Online returned HTTP 503/
  );
  assert.equal(navigations, 2);
});

test("attaches Redwood City Laserfiche minutes to the unique same-day City Council meeting", () => {
  const jurisdiction = getJurisdictionBySlug("redwood-city");
  assert.ok(jurisdiction);
  const meetings = normalizeAgendaOnlineRows([
    {
      meetingId: "2677",
      title: "June 8, 2026 Regular City Council Meeting",
      bodyName: "City Council",
      dateText: "6/8/2026 6:00:00 PM",
      rowText: "June 8, 2026 Regular City Council Meeting",
      detailsUrl: "https://meetings.redwoodcity.org/AgendaOnline/Meetings/ViewMeeting?id=2677",
      documents: []
    }
  ], jurisdiction, Date.parse("2026-07-01"));

  assert.equal(attachLaserficheMinutes(meetings, [{
    label: "2026.06.08 Approved Minutes",
    url: "https://documents.redwoodcity.org/PublicWeblink/0/doc/528589/Page1.aspx"
  }]), 1);
  assert.equal(meetings[0].documents[0].type, "Minutes");
  assert.match(meetings[0].documents[0].url, /528589/);
});

test("cancels Chromium and replays Laserfiche downloads through the bounded streamer", async (t) => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-laserfiche-"));
  const originalFetch = globalThis.fetch;
  const generatedUrl = "https://documents.redwoodcity.org/generated/approved-minutes.pdf";
  let cancelled = false;
  let fetchedUrl = "";

  const download = {
    url: () => generatedUrl,
    cancel: async () => {
      cancelled = true;
    }
  } as unknown as Download;
  const page = {
    goto: async () => null,
    locator: () => ({ click: async () => undefined }),
    waitForEvent: async () => download,
    close: async () => undefined
  } as unknown as Page;
  const context = {
    newPage: async () => page,
    waitForEvent: () => new Promise<never>(() => undefined),
    cookies: async () => [],
    addCookies: async () => undefined,
    clearCookies: async () => undefined
  } as unknown as BrowserContext;
  const meetings = [{
    externalId: "redwood-city-agenda-online-2677",
    section: "Past Meetings",
    title: "June 8, 2026 Regular City Council Meeting",
    dateText: "6/8/2026 6:00:00 PM",
    meetingType: "City Council",
    rowText: "June 8, 2026 Regular City Council Meeting",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [{
      type: "Minutes",
      label: "2026.06.08 Approved Minutes",
      url: "https://documents.redwoodcity.org/PublicWeblink/0/doc/528589/Page1.aspx"
    }]
  }] as PrimeGovMeeting[];

  globalThis.fetch = (async (input) => {
    fetchedUrl = String(input);
    return new Response("%PDF-streamed-approved-minutes", {
      headers: { "content-type": "application/pdf" }
    });
  }) as typeof fetch;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  const result = await downloadLaserficheMinutes(
    context,
    meetings,
    outputDir,
    () => undefined,
    undefined,
    globalThis.fetch
  );

  assert.deepEqual(result, { downloaded: 1, failed: 0 });
  assert.equal(cancelled, true);
  assert.equal(fetchedUrl, generatedUrl);
  assert.equal(
    await fs.readFile(meetings[0].documents[0].localPath || "", "utf8"),
    "%PDF-streamed-approved-minutes"
  );
  assert.ok((await fs.readdir(outputDir)).every((name) => !name.endsWith(".part")));
});

test("normalizes Agenda Online item identifiers without losing dotted item numbers", () => {
  assert.deepEqual(
    normalizeAgendaOnlineItemLink("14763", "7.A. Authorization of annual membership dues"),
    {
      itemId: "14763",
      agendaNumber: "7.A",
      title: "Authorization of annual membership dues"
    }
  );
});
