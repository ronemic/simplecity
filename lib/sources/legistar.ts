import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type { PrimeGovDocument, PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { cleanText, slugify } from "@/lib/utils/slug";

const DEFAULT_LEGISTAR_URL = "https://sanmateocounty.legistar.com/Calendar.aspx";

const DOWNLOADABLE_DOCUMENT_TYPES = new Set([
  "Agenda",
  "Agenda Packet",
  "Minutes",
  "Document"
]);

export type ScrapeLegistarOptions = ScrapePortalOptions & {
  jurisdiction: JurisdictionConfig;
  enrichDetails?: boolean;
  clickSeeMore?: boolean;
  limit?: number;
};

type LegistarDocument = PrimeGovDocument & {
  type:
    | "Agenda"
    | "Agenda Packet"
    | "Minutes"
    | "Video"
    | "Audio"
    | "Captions"
    | "Meeting Details"
    | "Calendar"
    | "Document"
    | "Other";
};

type LegistarMeeting = PrimeGovMeeting & {
  meetingDetailsUrl?: string | null;
  detailText?: string | null;
  documents: LegistarDocument[];
};

function dedupeDocuments(documents: LegistarDocument[]) {
  const seen = new Set<string>();
  const result: LegistarDocument[] = [];

  for (const doc of documents) {
    const key = `${doc.type}|${doc.label}|${doc.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(doc);
  }

  return result;
}

function countByStatus(meetings: PrimeGovMeeting[], status: string) {
  return meetings.filter((meeting) => meeting.status === status).length;
}

function applyJurisdictionMetadata(meetings: PrimeGovMeeting[], jurisdiction: JurisdictionConfig) {
  for (const meeting of meetings) {
    meeting.jurisdictionName = jurisdiction.name;
    meeting.jurisdictionSlug = jurisdiction.slug;
    meeting.platform = jurisdiction.platform;

    for (const doc of meeting.documents) {
      doc.jurisdictionName = jurisdiction.name;
      doc.jurisdictionSlug = jurisdiction.slug;
      doc.platform = jurisdiction.platform;
    }
  }
}

function shouldIgnoreLink(label = "", href = "") {
  const text = label.toLowerCase();
  const url = href.toLowerCase();

  return (
    text.includes("login") ||
    text.includes("rss") ||
    text.includes("print") ||
    text.includes("email") ||
    text.includes("home") ||
    text.includes("search") ||
    text.includes("full calendar") ||
    text.includes("back to") ||
    text.includes("share") ||
    text.includes("subscribe") ||
    text === "home" ||
    url.endsWith("#") ||
    url.startsWith("javascript:")
  );
}

function classifyLink(label = "", href = ""): LegistarDocument["type"] {
  const text = label.toLowerCase();
  const url = href.toLowerCase();

  if (text.includes("meeting detail") || url.includes("meetingdetail.aspx")) return "Meeting Details";
  if (text.includes("agenda packet") || text.includes("packet")) return "Agenda Packet";
  if (text === "agenda" || text.includes("agenda")) return "Agenda";
  if (text.includes("minutes")) return "Minutes";
  if (text.includes("video")) return "Video";
  if (text.includes("audio")) return "Audio";
  if (text.includes("caption")) return "Captions";
  if (text.includes("calendar") || text.includes("icalendar")) return "Calendar";
  if (url.includes(".pdf") || url.includes("view.ashx") || url.includes("document")) return "Document";

  return "Other";
}

function acceptedDocumentType(type: string) {
  return [
    "Agenda",
    "Agenda Packet",
    "Minutes",
    "Video",
    "Audio",
    "Captions",
    "Meeting Details",
    "Calendar",
    "Document"
  ].includes(type);
}

async function waitForLegistarPortal(page: Page, portalUrl: string) {
  await page.goto(portalUrl, {
    waitUntil: "networkidle",
    timeout: 60000
  });

  await page.waitForTimeout(5000);
  await page
    .waitForSelector("a[href*='MeetingDetail.aspx'], a[href*='MeetingDetail'], table", {
      timeout: 30000
    })
    .catch(() => undefined);
}

function buildLegistarDocumentFilename(meeting: PrimeGovMeeting, docType: string, sourceUrl: string) {
  let documentId = "unknown-id";

  try {
    const parsed = new URL(sourceUrl);
    documentId =
      parsed.searchParams.get("ID") ||
      parsed.searchParams.get("FileID") ||
      parsed.searchParams.get("MeetingID") ||
      parsed.pathname.split("/").filter(Boolean).at(-1) ||
      documentId;
  } catch {
    documentId = sourceUrl.slice(-24);
  }

  return [
    meeting.section === "Past Meetings" ? "past" : "upcoming",
    meeting.dateText ? slugify(meeting.dateText) : "no-date",
    slugify(meeting.title || "untitled-meeting"),
    slugify(docType),
    slugify(documentId)
  ]
    .filter(Boolean)
    .join("__");
}

async function downloadLegistarDocuments(
  context: BrowserContext,
  meetings: PrimeGovMeeting[],
  options: { outputDir?: string; log?: (message: string) => void } = {}
) {
  const docsDir = options.outputDir || path.join(process.cwd(), "scraped-primegov");
  const log = options.log || (() => undefined);
  let downloaded = 0;
  let failed = 0;

  await fs.mkdir(docsDir, { recursive: true });

  for (const meeting of meetings) {
    const docs = meeting.documents.filter((doc) => DOWNLOADABLE_DOCUMENT_TYPES.has(doc.type));

    for (const doc of docs) {
      const filename = buildLegistarDocumentFilename(meeting, doc.type, doc.url);

      try {
        const response = await context.request.get(doc.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 SimpleCity civic agenda scraper",
            Referer: meeting.meetingDetailsUrl || meeting.sourceUrl || doc.url
          },
          timeout: 60000
        });

        if (!response.ok()) {
          failed += 1;
          doc.localPath = null;
          doc.downloadError = `HTTP ${response.status()}`;
          log(`Failed download ${doc.url}: ${response.status()}`);
          continue;
        }

        const buffer = await response.body();
        const contentType = response.headers()["content-type"] || "";
        const firstBytes = buffer.subarray(0, 5).toString();

        if (firstBytes === "%PDF-") {
          const filePath = path.join(docsDir, `${filename}.pdf`);
          await fs.writeFile(filePath, buffer);

          downloaded += 1;
          doc.localPath = filePath;
          doc.bytes = buffer.length;
          doc.downloadError = null;
          log(`Downloaded: ${filePath}`);
          continue;
        }

        const bodyText = buffer.toString("utf8");
        if (contentType.includes("text/html") || /^\s*</.test(bodyText)) {
          const filePath = path.join(docsDir, `${filename}.html`);
          await fs.writeFile(filePath, buffer);

          downloaded += 1;
          doc.localPath = filePath;
          doc.bytes = buffer.length;
          doc.extractedText = cleanText(bodyText.replace(/<[^>]+>/g, " "));
          doc.extractionCharacterCount = doc.extractedText.length;
          doc.downloadError = null;
          log(`Saved HTML document text: ${filePath}`);
          continue;
        }

        const errorPath = path.join(docsDir, `${filename}.download`);
        await fs.writeFile(errorPath, buffer);

        failed += 1;
        doc.localPath = null;
        doc.bytes = buffer.length;
        doc.downloadError = `Downloaded file was not a PDF or HTML document. Saved response to ${errorPath}`;
        log(`Unsupported Legistar document response: ${doc.url}`);
      } catch (error) {
        failed += 1;
        doc.localPath = null;
        doc.downloadError = error instanceof Error ? error.message : "Unknown download error";
        log(`Download error for ${doc.url}: ${doc.downloadError}`);
      }
    }
  }

  return { downloaded, failed };
}

async function scrapeLegistarDetails(context: BrowserContext, meeting: LegistarMeeting, log: (message: string) => void) {
  const detailUrl = meeting.meetingDetailsUrl;
  if (!detailUrl) return;

  const page = await context.newPage();

  try {
    await page.evaluate("globalThis.__name = (value) => value");
    await page.goto(detailUrl, {
      waitUntil: "networkidle",
      timeout: 60000
    });
    await page.waitForTimeout(1500);

    meeting.detailText = cleanText(await page.locator("body").innerText());
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]"))
        .map((anchor) => ({
          label: (anchor.textContent || "").replace(/\s+/g, " ").trim(),
          href: anchor.getAttribute("href")
        }))
        .filter((link) => Boolean(link.href))
    );

    const detailDocs: LegistarDocument[] = [];

    for (const link of links) {
      const url = new URL(link.href || "", page.url()).toString();
      if (shouldIgnoreLink(link.label, url)) continue;
      const type = classifyLink(link.label, url);
      if (!acceptedDocumentType(type)) continue;

      detailDocs.push({
        type,
        label: link.label || type,
        url,
        jurisdictionName: meeting.jurisdictionName,
        jurisdictionSlug: meeting.jurisdictionSlug,
        platform: meeting.platform
      });
    }

    meeting.documents = dedupeDocuments([...meeting.documents, ...detailDocs]);
    meeting.hasPdf = meeting.documents.some((doc) =>
      ["Agenda", "Agenda Packet", "Document", "Minutes"].includes(doc.type)
    );

    log(`Enriched Legistar detail page for ${meeting.title}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Legistar detail page error";
    meeting.extractionNotes = [
      ...(meeting.extractionNotes || []),
      `Legistar detail page enrichment failed: ${message}`
    ];
    log(`Legistar detail page enrichment failed for ${meeting.title}: ${message}`);
  } finally {
    await page.close();
  }
}

async function extractVisibleLegistarMeetings(
  page: Page,
  jurisdiction: JurisdictionConfig
): Promise<LegistarMeeting[]> {
  await page.evaluate("globalThis.__name = (value) => value");

  return (await page.evaluate(
    ({ jurisdiction }) => {
      function cleanTextInPage(text = "") {
        return text.replace(/\s+/g, " ").trim();
      }

      function yPos(el: Element) {
        const rect = el.getBoundingClientRect();
        return rect.top + window.scrollY;
      }

      function absoluteUrl(href: string | null) {
        if (!href) return null;

        try {
          return new URL(href, window.location.href).toString();
        } catch {
          return null;
        }
      }

      function extractDateTime(rowText: string) {
        const match =
          rowText.match(
            /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/i
          ) ||
          rowText.match(/\b\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/i);

        if (!match) return { dateText: null, timeText: null, dateTimeText: null };

        const dateTimeText = match[0];
        const timeMatch = dateTimeText.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i);
        const timeText = timeMatch ? timeMatch[0] : null;
        const dateText = timeText ? cleanTextInPage(dateTimeText.replace(timeText, "")) : dateTimeText;

        return { dateText, timeText, dateTimeText };
      }

      function classifyLink(label = "", href = "") {
        const text = label.toLowerCase();
        const url = href.toLowerCase();

        if (text.includes("meeting detail") || url.includes("meetingdetail.aspx")) return "Meeting Details";
        if (text.includes("agenda packet") || text.includes("packet")) return "Agenda Packet";
        if (text === "agenda" || text.includes("agenda")) return "Agenda";
        if (text.includes("minutes")) return "Minutes";
        if (text.includes("video")) return "Video";
        if (text.includes("audio")) return "Audio";
        if (text.includes("caption")) return "Captions";
        if (text.includes("calendar") || text.includes("icalendar")) return "Calendar";
        if (url.includes(".pdf") || url.includes("view.ashx") || url.includes("document")) return "Document";

        return "Other";
      }

      function shouldIgnoreLink(label = "", href = "") {
        const text = label.toLowerCase();
        const url = href.toLowerCase();

        return (
          text.includes("login") ||
          text.includes("rss") ||
          text.includes("print") ||
          text.includes("email") ||
          text.includes("home") ||
          text.includes("search") ||
          text.includes("share") ||
          text.includes("subscribe") ||
          text.includes("full calendar") ||
          text.includes("back to") ||
          text === "home" ||
          url.endsWith("#") ||
          url.startsWith("javascript:")
        );
      }

      function acceptedDocumentType(type: string) {
        return [
          "Agenda",
          "Agenda Packet",
          "Minutes",
          "Video",
          "Audio",
          "Captions",
          "Meeting Details",
          "Calendar",
          "Document"
        ].includes(type);
      }

      function isMeetingCancelled(title = "", rowText = "") {
        return /cancelled/i.test(title) || /cancelled/i.test(rowText);
      }

      function findHeadingY(exactText: string) {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
        const match = headings.find((el) => {
          const text = cleanTextInPage(((el as HTMLElement).innerText || el.textContent || ""));
          return text.toLowerCase() === exactText.toLowerCase();
        });

        return match ? yPos(match) : null;
      }

      function sectionForY(elementY: number, upcomingY: number | null, pastY: number | null) {
        if (upcomingY !== null && pastY !== null && elementY > upcomingY && elementY < pastY) {
          return "Upcoming Meetings";
        }

        if (pastY !== null && elementY > pastY) return "Past Meetings";
        if (upcomingY !== null && elementY > upcomingY) return "Upcoming Meetings";
        return "Unknown";
      }

      type RowEntry = {
        elementY: number;
        rowText: string;
        meetingDetailsUrl: string | null;
        documents: Array<{ type: string; label: string; url: string }>;
      };

      function getOrCreateRow(rowMap: Map<string, RowEntry>, container: Element) {
        const rowText = cleanTextInPage((container as HTMLElement).innerText || "");
        const { dateText } = extractDateTime(rowText);
        if (!rowText || rowText.length > 1600 || !dateText) return null;

        const key = rowText.slice(0, 800);
        if (!rowMap.has(key)) {
          rowMap.set(key, {
            elementY: yPos(container),
            rowText,
            meetingDetailsUrl: null,
            documents: []
          });
        }

        return rowMap.get(key) || null;
      }

      const upcomingY =
        findHeadingY("Upcoming Meetings") ||
        findHeadingY("Current Meetings") ||
        findHeadingY("Current And Upcoming Meetings");
      const pastY = findHeadingY("Past Meetings") || findHeadingY("Archived Meetings");

      const rowMap = new Map<string, RowEntry>();
      const floatingLinks: Array<{ elementY: number; type: string; label: string; url: string }> =
        [];

      for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
        const label = cleanTextInPage((anchor as HTMLElement).innerText || anchor.textContent || "");
        const url = absoluteUrl(anchor.getAttribute("href"));
        if (!url || shouldIgnoreLink(label, url)) continue;

        const type = classifyLink(label, url);
        if (!acceptedDocumentType(type)) continue;

        floatingLinks.push({
          elementY: yPos(anchor),
          type,
          label: label || type,
          url
        });

        const container =
          anchor.closest("tr") ||
          anchor.closest("li") ||
          anchor.closest("[role='row']") ||
          anchor.closest("div");

        if (!container) continue;

        const entry = getOrCreateRow(rowMap, container);
        if (!entry) continue;

        if (type === "Meeting Details") {
          entry.meetingDetailsUrl = url;
        }

        entry.documents.push({
          type,
          label: label || type,
          url
        });
      }

      for (const container of Array.from(document.querySelectorAll("tr,li,[role='row'],div"))) {
        getOrCreateRow(rowMap, container);
      }

      const rowEntries = Array.from(rowMap.values()).sort((left, right) => left.elementY - right.elementY);

      for (const link of floatingLinks) {
        let bestEntry: RowEntry | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const entry of rowEntries) {
          const distance = Math.abs(entry.elementY - link.elementY);
          if (distance <= 180 && distance < bestDistance) {
            bestEntry = entry;
            bestDistance = distance;
          }
        }

        if (!bestEntry) continue;

        if (link.type === "Meeting Details") {
          bestEntry.meetingDetailsUrl = link.url;
        }

        bestEntry.documents.push({
          type: link.type,
          label: link.label,
          url: link.url
        });
      }

      const meetings = [];
      const seenMeetingKeys = new Set<string>();

      for (const entry of rowEntries) {
        const { dateText, timeText, dateTimeText } = extractDateTime(entry.rowText);
        const section = sectionForY(entry.elementY, upcomingY, pastY);
        const rowPrefix = dateTimeText ? entry.rowText.split(dateTimeText)[0] : entry.rowText;
        const derivedBodyName = cleanTextInPage(
          rowPrefix
            .replace(/\bMeeting details\b/gi, " ")
            .replace(/\bAgenda\b/gi, " ")
            .replace(/\bVideo\b/gi, " ")
            .replace(/\bMinutes\b/gi, " ")
            .replace(/\bDocument\b/gi, " ")
            .replace(/\s+/g, " ")
        );

        let title = entry.rowText;
        if (dateTimeText) title = title.replace(dateTimeText, "");

        for (const doc of entry.documents) {
          if (doc.label) title = title.replace(doc.label, "");
        }

        title = title
          .replace(
            /\b(Agenda Packet|Agenda|Minutes|Video|Audio|Captions?|Meeting Details|Calendar|Document)\b/gi,
            " "
          )
          .replace(/Cancelled/gi, " ")
          .replace(/\|/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (!title || title.length > 500) continue;

        const bodyName =
          derivedBodyName ||
          (title.includes(" - ") ? title.split(" - ")[0].trim() : title);
        const seenDocKeys = new Set<string>();
        const documents = (entry.documents as Array<{ type: string; label: string; url: string }>).filter(
          (doc: { type: string; label: string; url: string }) => {
            const key = `${doc.type}|${doc.label}|${doc.url}`;
            if (seenDocKeys.has(key)) return false;
            seenDocKeys.add(key);
            return true;
          }
        );

        const sourceUrl =
          entry.meetingDetailsUrl ||
          documents.find((doc: { type: string; label: string; url: string }) => doc.type === "Agenda")
            ?.url ||
          documents.find(
            (doc: { type: string; label: string; url: string }) => doc.type === "Agenda Packet"
          )?.url ||
          jurisdiction.sourceUrl;

        const key = [
          section,
          dateText || "",
          timeText || "",
          title,
          documents.map((doc: { url: string }) => doc.url).sort().join("|")
        ].join("|");

        if (seenMeetingKeys.has(key)) continue;
        seenMeetingKeys.add(key);

        meetings.push({
          jurisdictionName: jurisdiction.name,
          jurisdictionSlug: jurisdiction.slug,
          platform: jurisdiction.platform,
          source: jurisdiction.sourceUrl,
          section,
          title: bodyName || title || "Untitled meeting",
          bodyName,
          meetingType: bodyName || title || "Meeting type not listed",
          dateText,
          timeText,
          location: null,
          rowText: entry.rowText,
          status: isMeetingCancelled(title, entry.rowText)
            ? "Cancelled"
            : section === "Past Meetings"
              ? "Past"
              : "Upcoming",
          sourceUrl,
          meetingDetailsUrl: entry.meetingDetailsUrl,
          hasHtmlAgenda: false,
          hasPdf: documents.some((doc: { type: string }) =>
            ["Agenda", "Agenda Packet", "Document", "Minutes"].includes(doc.type)
          ),
          documents
        });
      }

      return meetings;
    },
    {
      jurisdiction: {
        name: jurisdiction.name,
        slug: jurisdiction.slug,
        sourceUrl: jurisdiction.sourceUrl,
        platform: jurisdiction.platform
      }
    }
  )) as LegistarMeeting[];
}

export async function scrapeLegistarMeetings(
  options: ScrapeLegistarOptions
): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const jurisdiction = options.jurisdiction;
  const portalUrl = options.portalUrl || jurisdiction.legistarUrl || jurisdiction.sourceUrl || DEFAULT_LEGISTAR_URL;

  const browser = await chromium.launch({
    headless: !options.headful
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 SimpleCity Legistar scraper",
    viewport: {
      width: 1600,
      height: 1200
    }
  });

  const page = await context.newPage();

  try {
    log("Opening Legistar portal...");
    await waitForLegistarPortal(page, portalUrl);

    log("Scraping Legistar meeting rows...");
    let meetings = await extractVisibleLegistarMeetings(page, jurisdiction);

    if (typeof options.limit === "number" && options.limit > 0) {
      meetings = meetings.slice(0, options.limit);
    }

    applyJurisdictionMetadata(meetings, jurisdiction);

    const upcomingCount = countByStatus(meetings, "Upcoming");
    const pastCount = countByStatus(meetings, "Past");
    const cancelledCount = countByStatus(meetings, "Cancelled");

    log(`Found ${upcomingCount} upcoming Legistar meetings.`);
    log(`Found ${pastCount} past Legistar meetings.`);
    log(`Found ${cancelledCount} cancelled Legistar meetings.`);

    if (options.enrichDetails ?? true) {
      log("Enriching Legistar meeting detail pages where available...");
      for (const meeting of meetings as LegistarMeeting[]) {
        await scrapeLegistarDetails(context, meeting, log);
      }
    }

    if (options.downloadDocuments) {
      log("Downloading Legistar documents where available...");
      await downloadLegistarDocuments(context, meetings, {
        log,
        outputDir: options.documentOutputDir
      });
    }

    return {
      source: portalUrl,
      scrapedAt: new Date().toISOString(),
      totalMeetingCount: meetings.length,
      currentAndUpcomingCount: upcomingCount,
      archivedCount: pastCount + cancelledCount,
      meetings
    };
  } finally {
    await browser.close();
  }
}
