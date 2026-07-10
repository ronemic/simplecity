import { chromium, type BrowserContext, type Page } from "playwright";
import type { PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import { cleanText, slugify } from "@/lib/utils/slug";

export const DEFAULT_PORTAL_URL =
  process.env.SCRAPER_BASE_URL || "https://fostercity.primegov.com/public/portal";

export const PORTAL_READY_SELECTOR =
  'a[href*="/Public/CompiledDocument" i], a[href*="/Portal/Meeting" i]';

export type ScrapePortalOptions = {
  portalUrl?: string;
  headful?: boolean;
  scrapeHtmlAgendas?: boolean;
  downloadDocuments?: boolean;
  enrichAgendaAttachments?: boolean;
  documentOutputDir?: string;
  allYears?: boolean;
  log?: (message: string) => void;
  shouldStop?: () => boolean;
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
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForLoadState("load", { timeout: 15000 }).catch(() => undefined);

  await page.waitForSelector(PORTAL_READY_SELECTOR, { timeout: 60000 });
}

export async function extractVisibleMeetings(page: Page): Promise<PrimeGovMeeting[]> {
  return (await page.evaluate(
    String.raw`(() => {
      function cleanTextInPage(text = "") {
        return text.replace(/\s+/g, " ").trim();
      }

      function yPos(el) {
        const rect = el.getBoundingClientRect();
        return rect.top + window.scrollY;
      }

      function classifyDocument(label = "", href = "") {
        const text = label.toLowerCase();
        const url = href.toLowerCase();

        if (
          text.includes("video") ||
          text.includes("media") ||
          text.includes("watch") ||
          text.includes("recording") ||
          url.includes("video") ||
          url.includes("media") ||
          url.includes("swagit.com") ||
          url.includes("granicus.com") ||
          url.includes("watch") ||
          url.includes("recording") ||
          url.includes("mediaplayer") ||
          url.includes("mode=granicus")
        ) {
          return "Video";
        }

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

      function isMeetingLink(link) {
        const text = link.label.toLowerCase();
        const url = link.url.toLowerCase();

        return (
          url.includes("/public/compileddocument") ||
          url.includes("/portal/meeting") ||
          text.includes("video") ||
          text.includes("media") ||
          text.includes("watch") ||
          text.includes("recording") ||
          url.includes("video") ||
          url.includes("media") ||
          url.includes("swagit.com") ||
          url.includes("granicus.com") ||
          url.includes("watch") ||
          url.includes("recording") ||
          url.includes("mediaplayer") ||
          url.includes("mode=granicus")
        );
      }

      function absoluteUrl(value = "") {
        if (!value) return "";

        try {
          const url = new URL(value, window.location.href);
          return /^https?:$/i.test(url.protocol) ? url.href : "";
        } catch {
          return "";
        }
      }

      function urlFromOnclick(onclick = "") {
        const match = onclick.match(/https?:\/\/[^'")\s]+|\/[A-Za-z0-9_./?=&:%-]+/);
        return match ? absoluteUrl(match[0]) : "";
      }

      function elementUrl(element) {
        const attrs = [
          "href",
          "data-url",
          "data-href",
          "data-link",
          "data-target",
          "data-video-url",
          "data-src"
        ];

        for (const attr of attrs) {
          const url = absoluteUrl(element.getAttribute(attr) || "");
          if (url) return url;
        }

        return urlFromOnclick(element.getAttribute("onclick") || "");
      }

      function elementLabel(element) {
        return cleanTextInPage(
          element.innerText ||
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            ""
        );
      }

      function deriveMeetingType(title = "") {
        return title
          .replace(/\s*-\s*Cancelled\s*$/i, "")
          .replace(/\s+Regular Meeting\s*$/i, "")
          .trim();
      }

      function findHeadingY(exactText) {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));

        const match = headings.find((el) => {
          const text = cleanTextInPage((el.innerText || el.textContent || ""));
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
        const tableText = cleanTextInPage(table.innerText || table.textContent || "");
        const tableTextLower = tableText.toLowerCase();
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
        } else if (
          tableTextLower.includes("meeting title") &&
          tableTextLower.includes("date/time") &&
          tableTextLower.includes("video")
        ) {
          section = "Archived Meetings";
        }

        const rows = Array.from(table.querySelectorAll("tbody tr, tr"));

        for (const row of rows) {
          const rowText = cleanTextInPage(row.innerText || "");
          if (!rowText) continue;

          const links = Array.from(
            row.querySelectorAll(
              "a[href], button, [role='button'], [onclick], [data-url], [data-href], [data-link], [data-target], [data-video-url], [data-src]"
            )
          )
            .map((element) => ({
              label: elementLabel(element),
              url: elementUrl(element)
            }))
            .filter((link) => isMeetingLink(link));

          if (links.length === 0) continue;

          const cells = Array.from(row.querySelectorAll("td, [role='cell']")).map((cell) =>
            cleanTextInPage(cell.innerText || "")
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
              rowText.match(/\b\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/i) ||
              rowText.match(
                /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/i
              );

            dateText = dateMatch ? dateMatch[0] : null;
          }

          const seenDocs = new Set();
          const documents = links
            .map((link) => ({
              type: classifyDocument(link.label, link.url),
              label: link.label,
              url: link.url
            }))
            .filter((doc) => doc.url)
            .filter((doc) => {
              const key = doc.type + "|" + doc.label + "|" + doc.url;
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
    })()`
  )) as PrimeGovMeeting[];
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
  } catch {
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
    await page.waitForFunction(
      () => document.querySelectorAll("table tbody tr, table tr").length > 3,
      { timeout: 5000 }
    ).catch(() => undefined);
    await page.waitForTimeout(1500);

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
    const dedupedCurrentMeetings = meetings.filter(
      (meeting) => meeting.section === "Current And Upcoming Meetings"
    );
    const dedupedArchivedMeetings = meetings.filter(
      (meeting) => meeting.section === "Archived Meetings"
    );

    if (options.scrapeHtmlAgendas) {
      log("Scraping HTML agenda text where available...");

      for (const meeting of meetings) {
        if (options.shouldStop?.()) {
          log("Stopping HTML agenda scraping early because the pipeline deadline is near.");
          break;
        }

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
      await downloadCompiledDocuments(context, meetings, {
        log,
        outputDir: options.documentOutputDir,
        shouldStop: options.shouldStop
      });
    }

    return {
      source: portalUrl,
      scrapedAt: new Date().toISOString(),
      totalMeetingCount: meetings.length,
      currentAndUpcomingCount: dedupedCurrentMeetings.length,
      archivedCount: dedupedArchivedMeetings.length,
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
