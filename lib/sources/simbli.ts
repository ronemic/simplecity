import { chromium, type Page } from "playwright";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type { DocumentType, PrimeGovDocument, PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { downloadOfficialSiteDocuments } from "@/lib/scraper/downloadDocuments";
import { isMeetingDateInWindow } from "@/lib/utils/meetingWindow";
import { parseMeetingDate } from "@/lib/utils/date";
import { cleanText } from "@/lib/utils/slug";

const LASD_ARCHIVE_URL = "https://www.lasdschools.org/284537_2";
const DEFAULT_NORMAL_REQUEST_CAP = 40;
const DEFAULT_DEEP_REQUEST_CAP = 80;
const SIMBLI_LISTING_RENDER_TIMEOUT_MS = 25_000;
const PUBLIC_BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type SimbliListingRow = {
  dateTimeText: string;
  title: string;
  meetingType: string;
  titleAction: string | null;
  minutesAction: string | null;
  minutesUrl: string | null;
  rowText: string;
};

export type LasdArchiveRow = {
  dateText: string;
  links: Array<{ label: string; url: string }>;
};

export type LasdArchivePageLink = {
  schoolYear: string;
  url: string;
};

export type ScrapeSimbliOptions = ScrapePortalOptions & {
  jurisdiction: JurisdictionConfig;
  limit?: number;
  monthsBack?: number;
  monthsForward?: number;
  allVisible?: boolean;
  body?: string;
  requestCap?: number;
};

export function simbliMeetingId(value?: string | null) {
  return value?.match(/(?:MID[=\"',:\s]+|View(?:Meeting|Minutes)\([^,]+,\s*["'])(\d+)/i)?.[1] || null;
}

export function simbliMinutesUrl(action: string | null, portalUrl: string) {
  const meetingId = simbliMeetingId(action);
  if (!meetingId) return null;
  const url = new URL("/SB_Meetings/ViewMeeting.aspx", portalUrl);
  url.searchParams.set("S", new URL(portalUrl).searchParams.get("S") || "");
  url.searchParams.set("MID", meetingId);
  url.searchParams.set("T", "1");
  return url.toString();
}

function absoluteUrl(value: string, source: string) {
  try {
    const url = new URL(value, source);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function documentType(label: string, url: string): DocumentType {
  const value = `${label} ${url}`.toLowerCase();
  if (value.includes("minute")) return "Minutes";
  if (value.includes("support")) return "Agenda Packet";
  if (value.includes("agenda")) return "Agenda";
  if (/youtu(?:\.be|be\.com)|video/.test(value)) return "Video";
  return "Document";
}

export function shouldDownloadSimbliDocument(document: PrimeGovDocument) {
  if (document.type === "Meeting Details" || document.type === "Video") return false;
  const documentUrl = new URL(document.url);
  return !(
    documentUrl.hostname === "simbli.eboardsolutions.com" &&
    /\/SB_Meetings\/ViewMeeting\.aspx/i.test(documentUrl.pathname)
  );
}

function boardMeeting(row: SimbliListingRow) {
  return row.meetingType.toLowerCase() === "board meeting";
}

function calendarDateKey(value: string | null) {
  if (!value) return null;
  const numeric = value.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (numeric) return `${numeric[3]}-${numeric[1].padStart(2, "0")}-${numeric[2].padStart(2, "0")}`;
  const named = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})\b/i);
  if (!named) return parseMeetingDate(value)?.slice(0, 10) || null;
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(named[1].toLowerCase()) + 1;
  return `${named[3]}-${String(month).padStart(2, "0")}-${named[2].padStart(2, "0")}`;
}

function meetingStatus(row: SimbliListingRow, now: number) {
  if (/\bcancell?ed\b|\bcancellation\b/i.test(`${row.title} ${row.rowText}`)) return "Cancelled" as const;
  const date = parseMeetingDate(row.dateTimeText);
  if (!date) return "Unknown" as const;
  return new Date(date).getTime() >= now ? "Upcoming" as const : "Past" as const;
}

export function normalizeSimbliRows(
  rows: SimbliListingRow[],
  jurisdiction: JurisdictionConfig,
  portalUrl = jurisdiction.sourceUrl,
  now = Date.now()
): PrimeGovMeeting[] {
  const seen = new Set<string>();
  const meetings: PrimeGovMeeting[] = [];
  const siteId = new URL(portalUrl).searchParams.get("S") || "";

  for (const row of rows) {
    if (!boardMeeting(row)) continue;
    const meetingId = simbliMeetingId(row.titleAction);
    if (!meetingId || seen.has(meetingId)) continue;
    seen.add(meetingId);
    const detailsUrl = new URL("/SB_Meetings/ViewMeeting.aspx", portalUrl);
    detailsUrl.searchParams.set("S", siteId);
    detailsUrl.searchParams.set("MID", meetingId);
    const status = meetingStatus(row, now);
    const documents: PrimeGovMeeting["documents"] = [{
      type: "Meeting Details",
      label: "Official Simbli meeting page",
      url: detailsUrl.toString()
    }];
    const minutesSourceUrl = row.minutesUrl || simbliMinutesUrl(row.minutesAction, portalUrl);
    if (minutesSourceUrl) {
      const url = absoluteUrl(minutesSourceUrl, portalUrl);
      if (url) documents.push({ type: "Minutes", label: "Minutes", url });
    }
    meetings.push({
      externalId: `${jurisdiction.slug}-simbli-meeting-${meetingId}`,
      jurisdictionName: jurisdiction.name,
      jurisdictionSlug: jurisdiction.slug,
      platform: jurisdiction.platform,
      section: status === "Upcoming" ? "Upcoming Meetings" : "Past Meetings",
      title: cleanText(row.title),
      dateText: cleanText(row.dateTimeText),
      timeText: cleanText(row.dateTimeText),
      meetingType: "Board of Trustees",
      bodyName: "Board of Trustees",
      location: null,
      rowText: cleanText(row.rowText),
      status,
      sourceType: "Simbli",
      sourceUrl: detailsUrl.toString(),
      source: portalUrl,
      sectionUrl: portalUrl,
      meetingDetailsUrl: detailsUrl.toString(),
      hasHtmlAgenda: false,
      hasPdf: documents.some((document) => document.type !== "Meeting Details"),
      documents,
      items: [],
      extractionNotes: []
    });
  }
  return meetings;
}

export function attachLasdArchiveDocuments(meetings: PrimeGovMeeting[], rows: LasdArchiveRow[]) {
  let attached = 0;
  for (const row of rows) {
    const archiveDate = calendarDateKey(row.dateText);
    if (!archiveDate) continue;
    let candidates = meetings.filter((meeting) =>
      calendarDateKey(meeting.dateText) === archiveDate
    );
    const archiveIsSpecial = /\bspecial\b/i.test(
      row.links.map((link) => `${link.label} ${link.url}`).join(" ")
    );
    if (candidates.length > 1) {
      candidates = candidates.filter((meeting) =>
        /\bspecial\b/i.test(meeting.title) === archiveIsSpecial
      );
    }
    if (candidates.length !== 1) continue;
    const meeting = candidates[0];
    const hasDirectMinutes = row.links.some((link) =>
      documentType(link.label, link.url) === "Minutes" && /\.pdf(?:$|[?#])/i.test(link.url)
    );
    if (hasDirectMinutes) {
      meeting.documents = meeting.documents.filter((document) => !(
        document.type === "Minutes" &&
        new URL(document.url).hostname === "simbli.eboardsolutions.com" &&
        /\/SB_Meetings\/ViewMeeting\.aspx/i.test(new URL(document.url).pathname)
      ));
    }
    for (const link of row.links) {
      if (meeting.documents.some((document) => document.url === link.url)) continue;
      meeting.documents.push({ type: documentType(link.label, link.url), label: cleanText(link.label), url: link.url });
      attached += 1;
    }
    meeting.hasPdf = meeting.documents.some((document) =>
      ["Agenda", "Agenda Packet", "Minutes"].includes(document.type)
    );
  }
  return attached;
}

export function schoolYearForDate(value: string | null) {
  const key = calendarDateKey(value);
  if (!key) return null;
  const [yearText, monthText] = key.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = month >= 7 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function neededLasdArchiveLinks(
  meetings: PrimeGovMeeting[],
  links: LasdArchivePageLink[]
) {
  const years = new Set(meetings.map((meeting) => schoolYearForDate(meeting.dateText)).filter(Boolean));
  const seen = new Set<string>();
  return links.filter((link) =>
    years.has(link.schoolYear) && !seen.has(link.url) && Boolean(seen.add(link.url))
  );
}

function archiveLinksForWindow(
  links: LasdArchivePageLink[],
  monthsBack: number,
  monthsForward: number,
  now = new Date()
) {
  const boundaries = [new Date(now), new Date(now), new Date(now)];
  boundaries[1].setMonth(boundaries[1].getMonth() - monthsBack);
  boundaries[2].setMonth(boundaries[2].getMonth() + monthsForward);
  const years = new Set(boundaries.map((date) => schoolYearForDate(date.toLocaleDateString("en-US"))));
  return links.filter((link) => years.has(link.schoolYear));
}

export function normalizeLasdArchiveRows(
  rows: LasdArchiveRow[],
  jurisdiction: JurisdictionConfig,
  portalUrl = jurisdiction.sourceUrl,
  now = Date.now()
): PrimeGovMeeting[] {
  const meetings: PrimeGovMeeting[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const dateKey = calendarDateKey(row.dateText);
    if (!dateKey || row.links.length === 0) continue;
    const combined = row.links.map((link) => `${link.label} ${link.url}`).join(" ");
    const special = /\bspecial\b/i.test(combined);
    const revised = /\brevised\b/i.test(combined);
    const supporting = row.links.find((link) => /support/i.test(link.label));
    const identity = simbliMeetingId(supporting?.url) || `${dateKey}-${special ? "special" : "regular"}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const title = `${special ? "Special" : "Regular"} Meeting of the Board of Trustees${revised ? " - Revised" : ""}`;
    const status = new Date(`${dateKey}T23:59:59`).getTime() >= now ? "Upcoming" as const : "Past" as const;
    const sourceUrl = supporting?.url || LASD_ARCHIVE_URL;
    const documents = row.links.map((link) => ({
      type: documentType(link.label, link.url),
      label: cleanText(link.label),
      url: link.url
    }));
    meetings.push({
      externalId: `${jurisdiction.slug}-simbli-meeting-${identity}`,
      jurisdictionName: jurisdiction.name,
      jurisdictionSlug: jurisdiction.slug,
      platform: jurisdiction.platform,
      section: status === "Upcoming" ? "Upcoming Meetings" : "Past Meetings",
      title,
      dateText: row.dateText,
      timeText: null,
      meetingType: "Board of Trustees",
      bodyName: "Board of Trustees",
      location: null,
      rowText: `${row.dateText} ${title}`,
      status,
      sourceType: "LASD official archive",
      sourceUrl,
      source: portalUrl,
      sectionUrl: LASD_ARCHIVE_URL,
      meetingDetailsUrl: sourceUrl,
      hasHtmlAgenda: false,
      hasPdf: documents.some((document) => ["Agenda", "Agenda Packet", "Minutes"].includes(document.type)),
      documents,
      items: [],
      extractionNotes: ["Discovered through the Los Altos School District's official Board archive."]
    });
  }
  return meetings;
}

async function extractListingRows(page: Page) {
  await page.locator('a[onclick*="ViewMeeting"]').first().waitFor({
    state: "attached",
    timeout: SIMBLI_LISTING_RENDER_TIMEOUT_MS
  });
  return page.locator("tr").evaluateAll<SimbliListingRow[]>((rows) => rows.map((row) => {
    const cells = Array.from(row.querySelectorAll(":scope > td"));
    if (cells.length !== 4) return null;
    const titleLink = cells[1].querySelector("a");
    if (!titleLink) return null;
    const minutesLink = cells[2].querySelector("a");
    return {
      dateTimeText: String(cells[0].textContent || "").replace(/\s+/g, " ").trim(),
      title: String(titleLink.textContent || "").replace(/\s+/g, " ").trim(),
      meetingType: String(cells[3].textContent || "").replace(/\s+/g, " ").trim(),
      titleAction: titleLink.getAttribute("onclick"),
      minutesAction: minutesLink?.getAttribute("onclick") || null,
      minutesUrl: minutesLink?.href && !minutesLink.href.startsWith("javascript:") ? minutesLink.href : null,
      rowText: String(row.textContent || "").replace(/\s+/g, " ").trim()
    };
  }).filter(Boolean) as SimbliListingRow[]);
}

async function listingDiagnostic(page: Page) {
  const title = cleanText(await page.title().catch(() => ""));
  const text = cleanText(await page.locator("body").innerText({ timeout: 5_000 }).catch(() => ""));
  return `URL ${page.url()}; title "${title || "(blank)"}"; body "${text.slice(0, 240) || "(blank)"}"`;
}

async function extractArchiveRows(page: Page) {
  await page.waitForSelector("table tbody tr", { timeout: 30_000 });
  return page.locator("table tbody tr").evaluateAll<LasdArchiveRow[]>((rows) => rows.map((row) => {
    const cells = Array.from(row.querySelectorAll(":scope > td"));
    if (cells.length < 2) return null;
    return {
      dateText: String(cells[0].textContent || "").replace(/\s+/g, " ").trim(),
      links: Array.from(row.querySelectorAll("a[href]")).map((anchor) => ({
        label: String(anchor.textContent || "Document").replace(/\s+/g, " ").trim(),
        url: (anchor as HTMLAnchorElement).href
      }))
    };
  }).filter(Boolean) as LasdArchiveRow[]);
}

async function extractArchivePageLinks(page: Page) {
  return page.locator('a[href]').evaluateAll<LasdArchivePageLink[]>((anchors) => anchors.map((anchor) => {
    const label = String(anchor.textContent || "").replace(/\s+/g, " ").trim();
    const schoolYear = label.match(/\b(20\d{2}-\d{2})\s+Board Meetings\b/i)?.[1];
    if (!schoolYear) return null;
    return { schoolYear, url: (anchor as HTMLAnchorElement).href };
  }).filter(Boolean) as LasdArchivePageLink[]);
}

export async function scrapeSimbliMeetings(options: ScrapeSimbliOptions): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const monthsBack = Math.max(0, options.monthsBack ?? 1);
  const requestCap = options.requestCap ?? (monthsBack >= 2 ? DEFAULT_DEEP_REQUEST_CAP : DEFAULT_NORMAL_REQUEST_CAP);
  let attempts = 0;
  const browser = await chromium.launch({ headless: !options.headful });
  const context = await browser.newContext({
    userAgent: PUBLIC_BROWSER_USER_AGENT,
    viewport: { width: 1600, height: 1200 }
  });
  const page = await context.newPage();
  const visit = async (url: string, label: string) => {
    if (options.shouldStop?.()) throw new Error("Simbli scrape stopped by the workflow deadline.");
    if (attempts >= requestCap) throw new Error(`Simbli request cap reached (${attempts}/${requestCap}).`);
    attempts += 1;
    log(`Simbli request ${attempts}/${requestCap}: ${label}.`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  };

  try {
    const portalUrl = options.portalUrl || options.jurisdiction.sourceUrl;
    let rows: SimbliListingRow[] = [];
    let listingError: unknown = null;
    for (let listingAttempt = 1; listingAttempt <= 3; listingAttempt += 1) {
      try {
        await visit(portalUrl, `meeting listing (attempt ${listingAttempt}/3)`);
        rows = await extractListingRows(page);
        if (rows.length > 0) break;
        throw new Error("The Simbli meeting grid contained no meeting rows.");
      } catch (error) {
        listingError = error;
        log(`Simbli listing attempt ${listingAttempt}/3 failed: ${error instanceof Error ? error.message : error}. ${await listingDiagnostic(page)}`);
        if (listingAttempt < 3 && !options.shouldStop?.()) {
          await page.waitForTimeout(750 * listingAttempt);
        }
      }
    }
    if (rows.length === 0) {
      log(`Simbli listing unavailable after bounded attempts; using LASD's official Board archive: ${listingError instanceof Error ? listingError.message : listingError}`);
    }
    rows = rows.filter(boardMeeting);
    if (!options.allVisible) {
      rows = rows.filter((row) => isMeetingDateInWindow(row.dateTimeText, null, options));
    }
    let meetings = normalizeSimbliRows(rows, options.jurisdiction, portalUrl);

    // LASD maintains this public official mirror. It supplies direct agenda,
    // minutes, and video links when Simbli's JavaScript-only detail view is unavailable.
    try {
      await visit(LASD_ARCHIVE_URL, "LASD agendas and minutes mirror");
      const archivePageLinks = await extractArchivePageLinks(page);
      const allArchiveRows = await extractArchiveRows(page);
      let attached = attachLasdArchiveDocuments(meetings, allArchiveRows);
      const archiveLinks = meetings.length > 0
        ? neededLasdArchiveLinks(meetings, archivePageLinks)
        : archiveLinksForWindow(
            archivePageLinks,
            monthsBack,
            Math.max(0, options.monthsForward ?? 1)
          );
      for (const archiveLink of archiveLinks) {
        await visit(archiveLink.url, `LASD ${archiveLink.schoolYear} Board archive`);
        const archivedRows = await extractArchiveRows(page);
        allArchiveRows.push(...archivedRows);
        attached += attachLasdArchiveDocuments(meetings, archivedRows);
      }
      if (meetings.length === 0) {
        meetings = normalizeLasdArchiveRows(allArchiveRows, options.jurisdiction, portalUrl)
          .filter((meeting) => options.allVisible || isMeetingDateInWindow(meeting.dateText, null, options));
      }
      log(`LASD official mirror attached ${attached} document link(s).`);
    } catch (error) {
      log(`LASD official mirror enrichment failed; keeping Simbli meeting records: ${error instanceof Error ? error.message : error}`);
    }

    if (options.limit) meetings = meetings.slice(0, options.limit);
    if (meetings.length === 0) {
      throw new Error("Simbli and LASD official archive found zero Board of Trustees meetings in the configured window.");
    }

    if (options.downloadDocuments ?? true) {
      let documentAttemptsReserved = 0;
      const result = await downloadOfficialSiteDocuments(context, meetings, {
        outputDir: options.documentOutputDir,
        log,
        shouldStop: options.shouldStop,
        documentFilter: (document) => {
          if (!shouldDownloadSimbliDocument(document)) {
            log(`Skipping ${document.label}: Simbli HTML meeting views are not trusted as documents; using LASD's direct official PDFs.`);
            return false;
          }
          // The shared downloader can make up to three bounded attempts for a
          // transient failure. Reserve all three so retries count against this
          // source's cap even when the first request succeeds.
          if (attempts + documentAttemptsReserved + 3 > requestCap) {
            log(`Skipping ${document.label}: Simbli request cap would be exceeded.`);
            return false;
          }
          documentAttemptsReserved += 3;
          return true;
        },
        userAgent: PUBLIC_BROWSER_USER_AGENT
      });
      attempts += documentAttemptsReserved;
      log(`Simbli/LASD downloads complete: ${result.downloaded} downloaded, ${result.failed} failed.`);
    }

    const upcoming = meetings.filter((meeting) => meeting.status === "Upcoming").length;
    log(`Simbli request summary: ${attempts}/${requestCap} sequential page attempt(s).`);
    return {
      source: portalUrl,
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
