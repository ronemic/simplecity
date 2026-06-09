import { chromium, type BrowserContext, type Page } from "playwright";
import type { PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import { cleanText, slugify } from "@/lib/utils/slug";

export const DEFAULT_PORTAL_URL =
  process.env.SCRAPER_BASE_URL || "https://fostercity.primegov.com/public/portal";

export type ScrapePortalOptions = {
  portalUrl?: string;
  headful?: boolean;
  scrapeHtmlAgendas?: boolean;
  downloadDocuments?: boolean;
  allYears?: boolean;
  log?: (message: string) => void;
};

export function getMeetingTemplateId(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("meetingTemplateId");
  } catch {
    return null;
  }
}

export function dedupeMeetings(meetings: PrimeGovMeeting[]) {
  const seen = new Set<string>();
  const result: PrimeGovMeeting[] = [];

  for (const meeting of meetings) {
    const docKey = meeting.documents.map((doc) => doc.url).sort().join("|");
    const key = `${meeting.section}|${meeting.title}|${meeting.dateText}|${docKey}`;

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(meeting);
  }

  return result;
}

export async function waitForPortal(page: Page, portalUrl = DEFAULT_PORTAL_URL) {
  await page.goto(portalUrl, {
    waitUntil: "networkidle",
    timeout: 60000
  });

  await page.waitForTimeout(7000);

  await page.waitForSelector(
    'a[href*="/Public/CompiledDocument"], a[href*="/Portal/Meeting"]',
    { timeout: 30000 }
  );
}

export async function extractVisibleMeetings(page: Page): Promise<PrimeGovMeeting[]> {
  return (await page.evaluate(() => {
    function cleanTextInPage(text = "") {
      return text.replace(/\s+/g, " ").trim();
    }

    function yPos(el: Element) {
      const rect = el.getBoundingClientRect();
      return rect.top + window.scrollY;
    }

    function classifyDocument(label = "", href = "") {
      const text = label.toLowerCase();
      const url = href.toLowerCase();

      if (text.includes("html agenda") || url.includes("/portal/meeting")) {
        return "HTML Agenda";
      }

      if (text.includes("packet")) return "Packet";
      if (text.includes("public comment")) return "Public Comments";
      if (text.includes("minute")) return "Minutes";
      if (text.includes("cancel")) return "Notice of Cancellation";
      if (text.includes("agenda")) return "Agenda";

      return "Other";
    }

    function deriveMeetingType(title = "") {
      return title
        .replace(/\s*-\s*Cancelled\s*$/i, "")
        .replace(/\s+Regular Meeting\s*$/i, "")
        .trim();
    }

    function findHeadingY(exactText: string) {
      const headings = Array.from(
        document.querySelectorAll("h1, h2, h3, h4, h5, h6")
      );

      const match = headings.find((el) => {
        const text = cleanTextInPage((el as HTMLElement).innerText || el.textContent || "");
        return text.toLowerCase() === exactText.toLowerCase();
      });

      return match ? yPos(match) : null;
    }

    const currentHeadingY = findHeadingY("Current And Upcoming Meetings");
    const archivedHeadingY = findHeadingY("Archived Meetings");

    const tables = Array.from(document.querySelectorAll("table"));
    const meetings = [];

    for (const table of tables) {
      const tableY = yPos(table);
      let section = "Unknown";

      if (
        currentHeadingY !== null &&
        archivedHeadingY !== null &&
        tableY > currentHeadingY &&
        tableY < archivedHeadingY
      ) {
        section = "Current And Upcoming Meetings";
      } else if (archivedHeadingY !== null && tableY > archivedHeadingY) {
        section = "Archived Meetings";
      }

      const rows = Array.from(table.querySelectorAll("tbody tr, tr"));

      for (const row of rows) {
        const rowText = cleanTextInPage((row as HTMLElement).innerText || "");
        if (!rowText) continue;

        const links = Array.from(row.querySelectorAll("a[href]"))
          .map((a) => ({
            label: cleanTextInPage((a as HTMLElement).innerText || a.textContent || ""),
            url: (a as HTMLAnchorElement).href
          }))
          .filter(
            (link) =>
              link.url.includes("/Public/CompiledDocument") ||
              link.url.includes("/Portal/Meeting")
          );

        if (links.length === 0) continue;

        const cells = Array.from(row.querySelectorAll("td, [role='cell']")).map((cell) =>
          cleanTextInPage((cell as HTMLElement).innerText || "")
        );

        let title = cells[0] || null;
        let dateText = cells[1] || null;

        if (!title) {
          title = rowText;
          for (const link of links) {
            if (link.label) title = title.replace(link.label, "");
          }
          title = cleanTextInPage(title);
        }

        if (!dateText) {
          const dateMatch =
            rowText.match(
              /\b\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/i
            ) ||
            rowText.match(
              /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/i
            );

          dateText = dateMatch ? dateMatch[0] : null;
        }

        const seenDocs = new Set<string>();
        const documents = links
          .map((link) => ({
            type: classifyDocument(link.label, link.url),
            label: link.label,
            url: link.url
          }))
          .filter((doc) => {
            const key = `${doc.type}|${doc.label}|${doc.url}`;
            if (seenDocs.has(key)) return false;
            seenDocs.add(key);
            return true;
          });

        meetings.push({
          section,
          title,
          dateText,
          meetingType: deriveMeetingType(title || ""),
          rowText,
          hasHtmlAgenda: documents.some((doc) => doc.type === "HTML Agenda"),
          hasPdf: documents.some((doc) => doc.url.includes("/Public/CompiledDocument")),
          documents
        });
      }
    }

    return meetings;
  })) as PrimeGovMeeting[];
}

export async function scrapeHtmlAgendaText(context: BrowserContext, meeting: PrimeGovMeeting) {
  const htmlAgenda = meeting.documents.find((doc) => doc.type === "HTML Agenda");
  if (!htmlAgenda) return null;

  const page = await context.newPage();

  try {
    await page.goto(htmlAgenda.url, {
      waitUntil: "networkidle",
      timeout: 60000
    });

    await page.waitForTimeout(3000);
    const text = await page.locator("body").innerText();
    return cleanText(text);
  } catch (error) {
    return null;
  } finally {
    await page.close();
  }
}

export async function scrapePortal(options: ScrapePortalOptions = {}): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const portalUrl = options.portalUrl || DEFAULT_PORTAL_URL;

  const browser = await chromium.launch({
    headless: !options.headful
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 SimpleCity civic agenda scraper",
    viewport: {
      width: 1600,
      height: 1200
    }
  });

  const page = await context.newPage();

  try {
    log("Opening PrimeGov portal...");
    await waitForPortal(page, portalUrl);

    log("Scraping current and upcoming meetings...");
    const visibleMeetings = await extractVisibleMeetings(page);

    const currentMeetings = visibleMeetings.filter(
      (meeting) => meeting.section === "Current And Upcoming Meetings"
    );

    const archivedMeetings = visibleMeetings.filter(
      (meeting) => meeting.section === "Archived Meetings"
    );

    log(`Found ${currentMeetings.length} current/upcoming meetings.`);
    log(`Found ${archivedMeetings.length} archived meetings.`);

    const meetings = dedupeMeetings([...currentMeetings, ...archivedMeetings]);

    if (options.scrapeHtmlAgendas) {
      log("Scraping HTML agenda text where available...");

      for (const meeting of meetings) {
        if (!meeting.hasHtmlAgenda) continue;
        meeting.htmlAgendaText = await scrapeHtmlAgendaText(context, meeting);
        if (meeting.htmlAgendaText) {
          log(`Scraped HTML agenda for ${meeting.title}.`);
        }
      }
    }

    if (options.downloadDocuments) {
      const { downloadCompiledDocuments } = await import("./downloadDocuments");
      log("Downloading PDFs where available...");
      await downloadCompiledDocuments(context, meetings, { log });
    }

    return {
      source: portalUrl,
      scrapedAt: new Date().toISOString(),
      totalMeetingCount: meetings.length,
      currentAndUpcomingCount: currentMeetings.length,
      archivedCount: archivedMeetings.length,
      meetings
    };
  } finally {
    await browser.close();
  }
}

export async function scrapeAllArchivePages(options: ScrapePortalOptions = {}) {
  const result = await scrapePortal(options);
  options.log?.(
    "Archive pagination entrypoint completed using the visible archive page exposed by the portal."
  );
  return result;
}

export function buildDownloadFilename(meeting: PrimeGovMeeting, docType: string, sourceUrl: string) {
  const meetingId = getMeetingTemplateId(sourceUrl) || "unknown-id";

  return [
    meeting.section === "Archived Meetings" ? "archived" : "upcoming",
    meeting.dateText ? slugify(meeting.dateText) : "no-date",
    slugify(meeting.title || "untitled-meeting"),
    slugify(docType),
    meetingId
  ]
    .filter(Boolean)
    .join("__");
}
