import crypto from "node:crypto";
import { chromium, type Page } from "playwright";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type { DocumentType, MeetingStatus, PrimeGovDocument, PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { cleanText, slugify } from "@/lib/utils/slug";
import { parseMeetingDate } from "@/lib/utils/date";
import { filterMeetingsToWindow } from "@/lib/utils/meetingWindow";

export type EastPaloAltoExtractedLink = { label: string; url: string; column: string };
export type EastPaloAltoExtractedRow = {
  bodyName: string;
  dateTimeText: string;
  rowText: string;
  links: EastPaloAltoExtractedLink[];
};

export type ScrapeEastPaloAltoOptions = ScrapePortalOptions & {
  jurisdiction: JurisdictionConfig;
  limit?: number;
  body?: string;
  monthsBack?: number;
  monthsForward?: number;
  allVisible?: boolean;
};

function normalized(value = "") {
  return cleanText(value).toLowerCase();
}

export function classifyEastPaloAltoLink(
  label = "",
  columnName = "",
  contextText = "",
  url = ""
): DocumentType {
  const text = normalized(`${label} ${columnName}`);
  const context = normalized(contextText);
  const column = normalized(columnName);
  const href = url.toLowerCase();
  if (/cancellation|cancelled|canceled/.test(`${text} ${context}`)) return "Notice of Cancellation";
  if (column.includes("agenda packet") || text.includes("agenda packet")) return "Agenda Packet";
  if (column === "agenda" || column === "agendas" || normalized(label) === "agenda") return "Agenda";
  if (text.includes("minutes")) return "Minutes";
  if (/video|youtube\.com|youtu\.be|granicus|iqm2|swagit/.test(`${text} ${href}`)) return "Video";
  if (text.includes("zoom") || href.includes("zoom.us")) return "Zoom";
  if (text.includes("public comment")) return "Public Comment";
  if (text.includes("staff report")) return "Staff Report";
  if (text.includes("attachment")) return "Attachment";
  if (column.includes("event link") || column === "view" || normalized(label).includes("view details")) {
    return "Meeting Details";
  }
  if (href.includes(".pdf") || text.includes("document")) return "Document";
  return "Other";
}

function splitDateTime(value: string) {
  const cleaned = cleanText(value);
  const time = cleaned.match(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i)?.[0] || null;
  const date = cleaned
    .replace(/^\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, "")
    .match(/(?:[A-Za-z]{3,9}\.?\s+\d{1,2},\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/)?.[0] || null;
  return { dateText: date, timeText: time };
}

function isVideo(type: DocumentType) {
  return type === "Video";
}

function statusFor(row: EastPaloAltoExtractedRow, iso: string | null): MeetingStatus {
  if (/\b(cancelled|canceled|cancellation)\b/i.test(row.rowText)) return "Cancelled";
  if (!iso) return "Unknown";
  return new Date(iso).getTime() >= Date.now() ? "Upcoming" : "Past";
}

export function normalizeEastPaloAltoRows(
  rows: EastPaloAltoExtractedRow[],
  jurisdiction: JurisdictionConfig
): PrimeGovMeeting[] {
  const meetings: PrimeGovMeeting[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const bodyName = cleanText(row.bodyName);
    const { dateText, timeText } = splitDateTime(row.dateTimeText);
    if (!bodyName || !dateText) continue;
    const iso = parseMeetingDate(`${dateText}${timeText ? ` ${timeText}` : ""}`);
    const documents: PrimeGovDocument[] = [];
    const docKeys = new Set<string>();
    for (const link of row.links) {
      const type = classifyEastPaloAltoLink(link.label, link.column, row.rowText, link.url);
      const key = `${type}|${link.url}`;
      if (docKeys.has(key)) continue;
      docKeys.add(key);
      documents.push({ type, label: link.label || type, url: link.url });
    }
    const details = documents.find((doc) => doc.type === "Meeting Details");
    // Committee landing-page links are reused across many dates, so they are
    // supporting documents, not meeting identities.
    const identity = `${bodyName}|${dateText}|${timeText || ""}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const hash = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 10);
    const status = statusFor(row, iso);
    const primary = documents.find((doc) => doc.type === "Agenda") ||
      documents.find((doc) => doc.type === "Agenda Packet") || details;
    meetings.push({
      externalId: `east-palo-alto-official-site-${slugify(bodyName)}-${slugify(dateText)}-${slugify(timeText || "no-time")}-${hash}`,
      jurisdictionName: jurisdiction.name,
      jurisdictionSlug: jurisdiction.slug,
      platform: jurisdiction.platform,
      source: jurisdiction.sourceUrl,
      section: status === "Past" ? "Past Meetings" : "Upcoming Meetings",
      title: bodyName,
      bodyName,
      meetingType: bodyName,
      dateText,
      timeText,
      location: null,
      rowText: row.rowText,
      status,
      sourceUrl: primary?.url || jurisdiction.sourceUrl,
      sectionUrl: jurisdiction.sourceUrl,
      meetingDetailsUrl: details?.url || null,
      hasHtmlAgenda: false,
      hasPdf: documents.some((doc) => !isVideo(doc.type) && /agenda|minutes|document|attachment/i.test(doc.type)),
      documents,
      extractionNotes: []
    });
  }
  return meetings;
}

async function extractRows(
  page: Page,
  baseUrl: string
): Promise<{ headers: string[]; rows: EastPaloAltoExtractedRow[] }> {
  await page.evaluate("globalThis.__name = (value) => value");
  return page.evaluate((sourceBaseUrl) => {
    const clean = (value = "") => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const norm = (value = "") => clean(value).toLowerCase();
    const tables = Array.from(document.querySelectorAll("table"));
    const table = tables.find((candidate) => {
      const headers = Array.from(candidate.querySelectorAll("th")).map((cell) => norm(cell.textContent || ""));
      return ["name", "date", "agenda", "event link", "agenda packet"].every((name) => headers.includes(name));
    });
    if (!table) return { headers: [], rows: [] };
    const headerRow = Array.from(table.querySelectorAll("tr")).find((row) => row.querySelector("th"));
    const headers = Array.from(headerRow?.querySelectorAll("th,td") || []).map((cell) => clean(cell.textContent || ""));
    const headerMap = new Map(headers.map((header, index) => [norm(header), index]));
    const absolute = (href: string) => {
      try { return new URL(href, sourceBaseUrl).toString(); } catch { return ""; }
    };
    const rows = Array.from(table.querySelectorAll("tr")).filter((row) => row !== headerRow).flatMap((row) => {
      const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td"));
      const bodyName = clean(cells[headerMap.get("name") ?? -1]?.textContent || "");
      const dateTimeText = clean(cells[headerMap.get("date") ?? -1]?.textContent || "");
      if (!bodyName || !dateTimeText) return [];
      const links = cells.flatMap((cell, index) => Array.from(cell.querySelectorAll("a[href]")).map((anchor) => ({
        label: clean(anchor.textContent || anchor.getAttribute("aria-label") || anchor.getAttribute("title") || ""),
        url: absolute(anchor.getAttribute("href") || ""),
        column: headers[index] || ""
      }))).filter((link) => /^https?:/.test(link.url));
      return [{ bodyName, dateTimeText, rowText: clean(row.textContent || ""), links }];
    });
    return { headers, rows };
  }, baseUrl);
}

async function extractHistoricalRows(
  page: Page,
  baseUrl: string
): Promise<{ headers: string[]; rows: EastPaloAltoExtractedRow[] }> {
  await page.evaluate("globalThis.__name = (value) => value");
  return page.evaluate((sourceBaseUrl) => {
    const clean = (value = "") => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const norm = (value = "") => clean(value).toLowerCase();
    const tables = Array.from(document.querySelectorAll("table"));
    const table = tables.find((candidate) => {
      const headers = Array.from(candidate.querySelectorAll("th")).map((cell) => norm(cell.textContent || ""));
      return headers.includes("date") && headers.includes("meeting") && headers.includes("minutes");
    });
    if (!table) return { headers: [], rows: [] };
    const headerRow = Array.from(table.querySelectorAll("tr")).find((row) => row.querySelector("th"));
    const headers = Array.from(headerRow?.querySelectorAll("th,td") || []).map((cell) => clean(cell.textContent || ""));
    const headerMap = new Map(headers.map((header, index) => [norm(header), index]));
    const absolute = (href: string) => {
      try { return new URL(href, sourceBaseUrl).toString(); } catch { return ""; }
    };
    const rows = Array.from(table.querySelectorAll("tr")).filter((row) => row !== headerRow).flatMap((row) => {
      const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td"));
      const bodyName = clean(cells[headerMap.get("meeting") ?? -1]?.textContent || "");
      const dateTimeText = clean(cells[headerMap.get("date") ?? -1]?.textContent || "");
      if (!bodyName || !dateTimeText) return [];
      const links = cells.flatMap((cell, index) => Array.from(cell.querySelectorAll("a[href]")).map((anchor) => ({
        label: clean(anchor.textContent || anchor.getAttribute("aria-label") || anchor.getAttribute("title") || headers[index] || ""),
        url: absolute(anchor.getAttribute("href") || ""),
        column: headers[index] || ""
      }))).filter((link) => /^https?:/.test(link.url));
      return [{ bodyName, dateTimeText, rowText: clean(row.textContent || ""), links }];
    });
    return { headers, rows };
  }, baseUrl);
}

function mergeExtractedRows(rows: EastPaloAltoExtractedRow[]) {
  const merged = new Map<string, EastPaloAltoExtractedRow>();
  for (const row of rows) {
    const { dateText, timeText } = splitDateTime(row.dateTimeText);
    const parsed = parseMeetingDate([dateText, timeText].filter(Boolean).join(" "));
    const key = `${normalized(row.bodyName)}|${parsed || normalized(row.dateTimeText)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, row);
      continue;
    }
    const links = new Map(
      [...existing.links, ...row.links].map((link) => [`${link.column}|${link.url}`, link])
    );
    merged.set(key, {
      ...existing,
      rowText: cleanText(`${existing.rowText} ${row.rowText}`),
      links: Array.from(links.values())
    });
  }
  return Array.from(merged.values());
}

async function fetchOfficialPage(url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
          Connection: "close"
        },
        signal: AbortSignal.timeout(60000)
      });
      if (response.ok) return response.text();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Official page request failed.");
}

export async function scrapeEastPaloAltoMeetings(options: ScrapeEastPaloAltoOptions): Promise<ScrapePortalResult> {
  const { jurisdiction } = options;
  const log = options.log || (() => undefined);
  const portalUrl = options.portalUrl || jurisdiction.officialSiteUrl || jurisdiction.sourceUrl;
  // The city's CDN intermittently advertises HTTP/2 and then closes the stream.
  // Chromium's HTTP/1.1 path is stable and is also what the official page serves to curl.
  const browser = await chromium.launch({ headless: !options.headful, args: ["--disable-http2"] });
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 SimpleCity East Palo Alto official-site scraper" });
  try {
    log(`Starting East Palo Alto official-site scraper for ${portalUrl}.`);
    log(`Database target: ${jurisdiction.regionSlug}; platform: ${jurisdiction.platform}.`);
    const page = await context.newPage();
    try {
      await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (navigationError) {
      log(`Browser navigation failed; retrying the server-rendered agenda through the request client: ${navigationError instanceof Error ? navigationError.message : String(navigationError)}`);
      const html = await fetchOfficialPage(portalUrl).catch(() => { throw navigationError; });
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 60000 });
    }
    await page.getByText("Agenda and Minutes", { exact: false }).first().waitFor({ timeout: 60000 });
    const embeddedUrl = await page.locator('iframe[src*="granicus.com"]').first().getAttribute("src");
    let tableUrl = portalUrl;
    if (embeddedUrl) {
      tableUrl = new URL(embeddedUrl, portalUrl).toString();
      log(`Loading the official Upcoming Events table embedded by ${portalUrl}.`);
      await page.setContent(await fetchOfficialPage(tableUrl), {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
    }
    await page.getByText("Upcoming Events", { exact: false }).first().waitFor({ timeout: 60000 });
    const extracted = await extractRows(page, tableUrl);
    log(`East Palo Alto table headers: ${extracted.headers.join(", ")}.`);
    log(`East Palo Alto Upcoming Events rows found: ${extracted.rows.length}.`);
    let historicalRows: EastPaloAltoExtractedRow[] = [];
    if (jurisdiction.meetingsUrl) {
      try {
        await page.goto(jurisdiction.meetingsUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      } catch {
        await page.setContent(await fetchOfficialPage(jurisdiction.meetingsUrl), {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
      }
      const historical = await extractHistoricalRows(page, jurisdiction.meetingsUrl);
      historicalRows = historical.rows;
      log(`East Palo Alto historical meeting rows found: ${historicalRows.length}.`);
    }
    const combinedRows = mergeExtractedRows([...extracted.rows, ...historicalRows]);
    let meetings = normalizeEastPaloAltoRows(combinedRows, jurisdiction);
    if (options.body) meetings = meetings.filter((meeting) => slugify(meeting.bodyName || "") === slugify(options.body || ""));
    if (!options.allVisible) {
      meetings = filterMeetingsToWindow(meetings, options);
    }
    if (options.limit) meetings = meetings.slice(0, options.limit);
    log(`East Palo Alto unique meetings after deduplication: ${meetings.length}.`);
    log(`East Palo Alto documents found: ${meetings.flatMap((meeting) => meeting.documents).length}.`);
    log(`East Palo Alto recordings found: ${meetings.flatMap((meeting) => meeting.documents).filter((doc) => doc.type === "Video").length}.`);
    if (!meetings.length) throw new Error("East Palo Alto scraper found zero valid meetings in the Upcoming Events table.");
    if (options.downloadDocuments) {
      const { downloadOfficialSiteDocuments } = await import("@/lib/scraper/downloadDocuments");
      const result = await downloadOfficialSiteDocuments(context, meetings, { outputDir: options.documentOutputDir, log, shouldStop: options.shouldStop });
      log(`East Palo Alto document downloads complete: ${result.downloaded} downloaded, ${result.failed} failed.`);
    }
    return {
      source: portalUrl,
      scrapedAt: new Date().toISOString(),
      totalMeetingCount: meetings.length,
      currentAndUpcomingCount: meetings.filter((meeting) => meeting.status === "Upcoming").length,
      archivedCount: meetings.filter((meeting) => meeting.status === "Past").length,
      meetings
    };
  } finally {
    await browser.close();
  }
}
