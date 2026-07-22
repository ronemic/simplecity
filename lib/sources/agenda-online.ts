import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type { DocumentType, PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { downloadOfficialSiteDocuments } from "@/lib/scraper/downloadDocuments";
import { parseMeetingDate } from "@/lib/utils/date";
import { cleanText, slugify } from "@/lib/utils/slug";
import { isMeetingDateInWindow } from "@/lib/utils/meetingWindow";

type AgendaOnlineRow = {
  meetingId: string;
  title: string;
  bodyName: string;
  dateText: string;
  rowText: string;
  detailsUrl: string | null;
  documents: Array<{ label: string; url: string }>;
};

export type LaserficheMinutesEntry = {
  label: string;
  url: string;
};

const REDWOOD_CITY_MINUTES_FOLDER_URL =
  "https://documents.redwoodcity.org/PublicWeblink/0/fol/527821/Row1.aspx";

export type ScrapeAgendaOnlineOptions = ScrapePortalOptions & {
  jurisdiction: JurisdictionConfig;
  limit?: number;
  monthsBack?: number;
  monthsForward?: number;
  allVisible?: boolean;
  body?: string;
};

function documentType(label: string, url: string): DocumentType {
  const code = new URL(url).searchParams.get("documentType");
  if (code === "5") return "Agenda Packet";
  if (code === "1") return "Agenda";
  const value = label.toLowerCase();
  if (value.includes("packet")) return "Agenda Packet";
  if (value.includes("minutes")) return "Minutes";
  if (value.includes("agenda")) return "Agenda";
  return "Document";
}

export function attachLaserficheMinutes(
  meetings: PrimeGovMeeting[],
  entries: LaserficheMinutesEntry[]
) {
  const meetingsByDate = new Map<string, PrimeGovMeeting[]>();
  for (const meeting of meetings) {
    const date = parseMeetingDate(meeting.dateText || "")?.slice(0, 10);
    if (!date) continue;
    meetingsByDate.set(date, [...(meetingsByDate.get(date) || []), meeting]);
  }

  let attached = 0;
  for (const entry of entries) {
    const archiveDate = entry.label.match(/\b(20\d{2})[.-](\d{2})[.-](\d{2})\b/);
    const date = archiveDate
      ? `${archiveDate[1]}-${archiveDate[2]}-${archiveDate[3]}`
      : parseMeetingDate(entry.label)?.slice(0, 10);
    if (!date) continue;
    const candidates = meetingsByDate.get(date) || [];
    const cityCouncilCandidates = candidates.filter((meeting) =>
      /city council/i.test(`${meeting.bodyName || ""} ${meeting.title}`)
    );
    const meeting = cityCouncilCandidates.length === 1
      ? cityCouncilCandidates[0]
      : candidates.length === 1
        ? candidates[0]
        : null;
    if (!meeting || meeting.documents.some((document) => document.url === entry.url)) continue;
    meeting.documents.push({
      type: "Minutes",
      label: cleanText(entry.label),
      url: entry.url,
      parentDocumentUrl: REDWOOD_CITY_MINUTES_FOLDER_URL
    });
    meeting.hasPdf = true;
    attached += 1;
  }
  return attached;
}

async function discoverRedwoodCityMinutes(page: Page) {
  await page.goto(REDWOOD_CITY_MINUTES_FOLDER_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  await page.waitForSelector("a.DocumentBrowserNameLink", { timeout: 60_000 });
  return page.locator("a.DocumentBrowserNameLink").evaluateAll<LaserficheMinutesEntry[]>(
    (anchors) => anchors.map((anchor) => ({
      label: String(anchor.textContent || "").replace(/\s+/g, " ").replace(/\[Icon\]/gi, "").trim(),
      url: (anchor as HTMLAnchorElement).href
    })).filter((entry) => /approved minutes/i.test(entry.label))
  );
}

export async function downloadLaserficheMinutes(
  context: BrowserContext,
  meetings: PrimeGovMeeting[],
  outputDir: string,
  log: (message: string) => void,
  shouldStop?: () => boolean
) {
  await fs.mkdir(outputDir, { recursive: true });
  const page = await context.newPage();
  let downloaded = 0;
  let failed = 0;
  try {
    for (const meeting of meetings) {
      for (const document of meeting.documents.filter((candidate) =>
        candidate.type === "Minutes" &&
        new URL(candidate.url).hostname === "documents.redwoodcity.org"
      )) {
        if (shouldStop?.()) return { downloaded, failed };
        try {
          await page.goto(document.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await page.locator("#PdfDialog_PdfDownloadLink").click();
          const generatedPdf = Promise.race([
            page.waitForEvent("download", { timeout: 120_000 })
              .then((download) => ({ kind: "download" as const, download })),
            context.waitForEvent("page", { timeout: 120_000 })
              .then(async (popup) => ({
                kind: "popup" as const,
                popup,
                response: await popup.waitForResponse(
                  (candidate) => /application\/pdf/i.test(candidate.headers()["content-type"] || ""),
                  { timeout: 120_000 }
                )
              }))
          ]);
          await page.locator("#PdfDialog_download").click();
          const generated = await generatedPdf;
          const filename = `${slugify(meeting.externalId || meeting.title)}__minutes__${slugify(document.label)}.pdf`;
          const filePath = path.join(outputDir, filename);
          if (generated.kind === "download") {
            await generated.download.saveAs(filePath);
          } else {
            const response = generated.response;
            if (!response.ok()) throw new Error(`Laserfiche PDF returned HTTP ${response.status()}.`);
            const buffer = await response.body().catch(async () => {
              const replay = await context.request.get(response.url(), {
                headers: { Referer: document.url },
                timeout: 120_000
              });
              if (!replay.ok()) {
                throw new Error(`Laserfiche PDF replay returned HTTP ${replay.status()}.`);
              }
              return replay.body();
            });
            if (buffer.subarray(0, 5).toString() !== "%PDF-") {
              throw new Error("Laserfiche generated response was not a PDF.");
            }
            await fs.writeFile(filePath, buffer);
            await generated.popup.close();
          }
          const stat = await fs.stat(filePath);
          document.localPath = filePath;
          document.bytes = stat.size;
          document.downloadError = null;
          downloaded += 1;
          log(`Downloaded Redwood City approved minutes: ${filePath}`);
        } catch (error) {
          document.localPath = null;
          document.downloadError = error instanceof Error ? error.message : "Unknown Laserfiche download error";
          failed += 1;
          log(`Redwood City minutes download failed for ${document.url}: ${document.downloadError}`);
        }
      }
    }
  } finally {
    await page.close();
  }
  return { downloaded, failed };
}

async function resolveDocumentStreams(context: BrowserContext, meetings: PrimeGovMeeting[]) {
  for (const meeting of meetings) {
    for (const document of meeting.documents) {
      const source = new URL(document.url);
      const meetingId = source.searchParams.get("meetingId") || "0";
      const documentType = source.searchParams.get("documentType") || "1";
      const isAttachment = source.searchParams.get("isAttachment")?.toLowerCase() === "true";
      const documentName = decodeURIComponent(source.pathname.split("/").at(-1) || "document.pdf");
      const invokePath = isAttachment
        ? `/AgendaOnline/Documents/InvokeDownloadAttachment/${encodeURIComponent(documentName)}?meetingId=${meetingId}&itemId=0&publishId=0&isSection=false&documentType=${documentType}`
        : `/AgendaOnline/Documents/InvokeDownloadMeetingDocument/${encodeURIComponent(documentName)}?meetingId=${meetingId}&documentType=${documentType}`;
      const response = await context.request.post(new URL(invokePath, source.origin).toString(), {
        headers: { Referer: document.url }
      });
      if (!response.ok()) continue;
      const stream = await response.json().catch(() => null) as null | {
        DocumentName?: string;
        MeetingId?: number;
        DocumentType?: number;
        ItemId?: number;
        PublishId?: number;
        IsSection?: boolean;
      };
      if (!stream?.DocumentName) continue;
      const view = new URL(
        `/AgendaOnline/Documents/ViewDocument/${encodeURIComponent(stream.DocumentName)}`,
        source.origin
      );
      view.searchParams.set("meetingId", String(stream.MeetingId ?? meetingId));
      view.searchParams.set("documentType", String(stream.DocumentType ?? documentType));
      view.searchParams.set("itemId", String(stream.ItemId ?? 0));
      view.searchParams.set("publishId", String(stream.PublishId ?? 0));
      view.searchParams.set("isSection", String(stream.IsSection ?? false).toLowerCase());
      document.url = view.toString();
    }
  }
}

export function normalizeAgendaOnlineRows(
  rows: AgendaOnlineRow[],
  jurisdiction: JurisdictionConfig,
  now = Date.now()
): PrimeGovMeeting[] {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (!row.meetingId || seen.has(row.meetingId)) return [];
    seen.add(row.meetingId);
    const parsed = parseMeetingDate(row.dateText);
    const cancelled = /cancelled|canceled/i.test(row.title);
    const status = cancelled ? "Cancelled" : parsed && new Date(parsed).getTime() >= now ? "Upcoming" : "Past";
    const sourceUrl = row.detailsUrl || jurisdiction.sourceUrl;
    return [{
      externalId: `${jurisdiction.slug}-agenda-online-${row.meetingId}`,
      jurisdictionName: jurisdiction.name,
      jurisdictionSlug: jurisdiction.slug,
      platform: jurisdiction.platform,
      section: status === "Upcoming" ? "Upcoming Meetings" : "Past Meetings",
      title: cleanText(row.title),
      dateText: row.dateText,
      meetingType: cleanText(row.bodyName),
      bodyName: cleanText(row.bodyName),
      rowText: cleanText(row.rowText),
      status,
      sourceType: "Agenda Online",
      sourceUrl,
      source: jurisdiction.sourceUrl,
      sectionUrl: jurisdiction.sourceUrl,
      meetingDetailsUrl: row.detailsUrl,
      hasHtmlAgenda: Boolean(row.detailsUrl),
      hasPdf: row.documents.length > 0,
      documents: row.documents.map((document) => ({
        type: documentType(document.label, document.url),
        label: cleanText(document.label),
        url: document.url
      })),
      items: [],
      extractionNotes: []
    } satisfies PrimeGovMeeting];
  });
}

export async function scrapeAgendaOnlineMeetings(
  options: ScrapeAgendaOnlineOptions
): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const browser = await chromium.launch({ headless: !options.headful });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 SimpleCity Agenda Online scraper",
    viewport: { width: 1600, height: 1200 }
  });
  const page = await context.newPage();

  try {
    log(`Starting Agenda Online scraper for ${options.jurisdiction.slug}.`);
    await page.goto(options.portalUrl || options.jurisdiction.sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });
    await page.waitForSelector("table tbody tr", { timeout: 60_000 });
    let rows = await page.evaluate<AgendaOnlineRow[]>(String.raw`(() => {
      const compact = (value = "") => value.replace(/\s+/g, " ").trim();
      return Array.from(document.querySelectorAll("table tbody tr")).map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        if (cells.length < 4) return null;
        const links = Array.from(row.querySelectorAll("a[href]"));
        const details = links.find((link) => /ViewMeeting/i.test(link.getAttribute("href") || ""));
        const identityUrl = links
          .map((link) => link.getAttribute("href") || "")
          .find((href) => /[?&](?:meetingId|id)=\d+/i.test(href)) || "";
        const meetingId = identityUrl.match(/[?&](?:meetingId|id)=(\d+)/i)?.[1] || "";
        const documentUrls = new Set();
        const documents = links
          .filter((link) => /Downloadfile/i.test(link.getAttribute("href") || ""))
          .map((link) => ({ label: compact(link.textContent || link.getAttribute("aria-label") || "Document"), url: link.href }))
          .filter((document) => documentUrls.has(document.url) ? false : (documentUrls.add(document.url), true));
        return {
          meetingId,
          title: compact(cells[0].textContent || ""),
          bodyName: compact(cells[1].textContent || ""),
          dateText: compact(cells[2].textContent || ""),
          rowText: compact(row.textContent || ""),
          detailsUrl: details?.href || null,
          documents
        };
      }).filter(Boolean);
    })()`);

    log(`Agenda Online rows extracted: ${rows.length}.`);
    if (!options.allVisible) {
      rows = rows.filter((row) =>
        isMeetingDateInWindow(row.dateText, null, options)
      );
    }
    if (options.body) {
      const body = slugify(options.body);
      rows = rows.filter((row) => slugify(row.bodyName) === body || slugify(row.title).includes(body));
    }

    let meetings = normalizeAgendaOnlineRows(rows, options.jurisdiction);
    if (options.limit) meetings = meetings.slice(0, options.limit);
    if (meetings.length === 0) throw new Error("Agenda Online scraper found zero valid meetings.");

    if (options.jurisdiction.slug === "redwood-city") {
      const archivePage = await context.newPage();
      try {
        const entries = await discoverRedwoodCityMinutes(archivePage);
        const attached = attachLaserficheMinutes(meetings, entries);
        log(`Redwood City Laserfiche archive exposed ${entries.length} approved minutes document(s); attached ${attached} to scraped meetings.`);
      } finally {
        await archivePage.close();
      }
    }

    if (options.downloadDocuments ?? true) {
      await resolveDocumentStreams(context, meetings);
      const result = await downloadOfficialSiteDocuments(context, meetings, {
        outputDir: options.documentOutputDir,
        log,
        shouldStop: options.shouldStop,
        documentFilter: (document) =>
          new URL(document.url).hostname !== "documents.redwoodcity.org",
        validateFinalUrl: (url) => new URL(url).hostname === new URL(options.jurisdiction.sourceUrl).hostname,
        userAgent: "Mozilla/5.0 SimpleCity Agenda Online scraper"
      });
      log(`Agenda Online downloads complete: ${result.downloaded} downloaded, ${result.failed} failed.`);
      if (options.jurisdiction.slug === "redwood-city") {
        const minutesResult = await downloadLaserficheMinutes(
          context,
          meetings,
          options.documentOutputDir || path.join(process.cwd(), "scraped-primegov", "redwood-city", "documents"),
          log,
          options.shouldStop
        );
        log(`Redwood City approved-minutes downloads complete: ${minutesResult.downloaded} downloaded, ${minutesResult.failed} failed.`);
      }
    }

    const upcoming = meetings.filter((meeting) => meeting.status === "Upcoming").length;
    log(`Agenda Online scraper found ${meetings.length} meeting(s).`);
    return {
      source: options.jurisdiction.sourceUrl,
      scrapedAt: new Date().toISOString(),
      totalMeetingCount: meetings.length,
      currentAndUpcomingCount: upcoming,
      archivedCount: meetings.length - upcoming,
      meetings
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
