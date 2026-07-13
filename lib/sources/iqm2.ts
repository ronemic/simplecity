import { chromium, type BrowserContext, type Page } from "playwright";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type { PrimeGovDocument, PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { cleanText, slugify } from "@/lib/utils/slug";
import { filterMeetingsToWindow } from "@/lib/utils/meetingWindow";

const IQM2_ORIGIN = "https://sccgov.iqm2.com";
export const DEFAULT_SANTA_CLARA_COUNTY_IQM2_URL =
  "https://sccgov.iqm2.com/Citizens/Default.aspx?frame=no";

const ENRICHABLE_DOCUMENT_TYPES = new Set([
  "Agenda",
  "Agenda Packet",
  "Minutes",
  "Video",
  "Audio",
  "Captions",
  "Document"
]);

export type ScrapeIqm2Options = ScrapePortalOptions & {
  jurisdiction: JurisdictionConfig;
  enrichDetails?: boolean;
  clickSeeMore?: boolean;
  limit?: number;
};

type Iqm2Document = PrimeGovDocument & {
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

type Iqm2Meeting = PrimeGovMeeting & {
  source?: string;
  bodyName?: string | null;
  timeText?: string | null;
  location?: string | null;
  meetingDetailsUrl?: string | null;
  detailText?: string | null;
  documents: Iqm2Document[];
};

function countByStatus(meetings: PrimeGovMeeting[], status: string) {
  return meetings.filter((meeting) => meeting.status === status).length;
}

function dedupeDocuments(documents: Iqm2Document[]) {
  const seen = new Set<string>();
  const result: Iqm2Document[] = [];

  for (const doc of documents) {
    const key = `${doc.type}|${doc.label}|${doc.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(doc);
  }

  return result;
}

export function dedupeIqm2Meetings(meetings: PrimeGovMeeting[]) {
  const seen = new Set<string>();
  const result: PrimeGovMeeting[] = [];

  for (const meeting of meetings) {
    const documentKey = meeting.documents
      .map((doc) => `${doc.type}:${doc.url}`)
      .sort()
      .join("|");
    const key = [
      meeting.section,
      meeting.dateText,
      (meeting as Iqm2Meeting).timeText || "",
      meeting.title,
      documentKey || meeting.sourceUrl || ""
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(meeting);
  }

  return result;
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

export function classifyIqm2Link(label = "", href = ""): Iqm2Document["type"] {
  const text = label.toLowerCase();
  const url = href.toLowerCase();

  if (text.includes("agenda packet")) return "Agenda Packet";
  if (text === "agenda" || text.includes("agenda")) return "Agenda";
  if (text.includes("minutes")) return "Minutes";
  if (
    text.includes("video") ||
    url.includes("video") ||
    url.includes("mediaplayer") ||
    url.includes("granicus.com") ||
    url.includes("swagit.com") ||
    url.includes("mode=granicus")
  ) return "Video";
  if (text.includes("audio")) return "Audio";
  if (text.includes("caption")) return "Captions";
  if (url.includes("detail_meeting.aspx")) return "Meeting Details";
  if (text.includes("calendar") || text.includes("icalendar")) return "Calendar";
  if (url.includes("fileopen.aspx") || url.includes(".pdf")) return "Document";

  return "Other";
}

export function shouldIgnoreIqm2Link(label = "", href = "") {
  const text = label.toLowerCase();
  const url = href.toLowerCase();

  return (
    text.includes("full calendar") ||
    text.includes("rss") ||
    text.includes("see more") ||
    text.includes("export to calendar") ||
    text.includes("login") ||
    text === "home" ||
    text === "help" ||
    url.startsWith("mailto:") ||
    url.includes("support@granicus.com") ||
    url.includes("/citizens/media.aspx") ||
    url.endsWith("#") ||
    url === "javascript:void(0)" ||
    url === "javascript:void(0);" ||
    url.includes("rss")
  );
}

async function waitForIqm2Portal(page: Page, portalUrl: string) {
  await page.goto(portalUrl, {
    waitUntil: "networkidle",
    timeout: 60000
  });

  await page.waitForTimeout(5000);
  await page.waitForSelector("text=Upcoming Meetings", { timeout: 30000 });
  await page.waitForSelector("text=Past Meetings", { timeout: 30000 }).catch(() => undefined);
}

async function clickVisibleSeeMoreLinks(page: Page, log: (message: string) => void) {
  const links = page.getByText(/see more/i);
  const count = await links.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    try {
      await links.nth(index).click({ timeout: 5000 });
      await page.waitForTimeout(1000);
      log("Clicked an IQM2 See more link.");
    } catch {
      log("Skipped an IQM2 See more link that could not be clicked.");
    }
  }
}

async function extractVisibleIqm2Meetings(
  page: Page,
  jurisdiction: JurisdictionConfig
): Promise<Iqm2Meeting[]> {
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
          const url = new URL(href, window.location.href);
          if (!["http:", "https:"].includes(url.protocol)) return null;
          return url.toString();
        } catch {
          return null;
        }
      }

      function urlFromOnclick(onclick: string | null) {
        if (!onclick) return null;

        const match =
          onclick.match(/OpenWindow\(\s*['"]([^'"]+)['"]/i) ||
          onclick.match(/window\.open\(\s*['"]([^'"]+)['"]/i);

        return absoluteUrl(match?.[1] || null);
      }

      function elementUrl(anchor: HTMLAnchorElement) {
        return urlFromOnclick(anchor.getAttribute("onclick")) ||
          absoluteUrl(anchor.getAttribute("href"));
      }

      function classifyLink(label = "", href = "") {
        const text = label.toLowerCase();
        const url = href.toLowerCase();

        if (text.includes("agenda packet")) return "Agenda Packet";
        if (text === "agenda" || text.includes("agenda")) return "Agenda";
        if (text.includes("minutes")) return "Minutes";
        if (
          text.includes("video") ||
          url.includes("video") ||
          url.includes("mediaplayer") ||
          url.includes("granicus.com") ||
          url.includes("swagit.com") ||
          url.includes("mode=granicus")
        ) return "Video";
        if (text.includes("audio")) return "Audio";
        if (text.includes("caption")) return "Captions";
        if (url.includes("detail_meeting.aspx")) return "Meeting Details";
        if (text.includes("calendar") || text.includes("icalendar")) return "Calendar";
        if (url.includes("fileopen.aspx") || url.includes(".pdf")) return "Document";

        return "Other";
      }

      function shouldIgnoreLink(label = "", href = "") {
        const text = label.toLowerCase();
        const url = href.toLowerCase();

        return (
          text.includes("full calendar") ||
          text.includes("rss") ||
          text.includes("see more") ||
          text.includes("export to calendar") ||
          text.includes("login") ||
          text === "home" ||
          text === "help" ||
          url.startsWith("mailto:") ||
          url.includes("support@granicus.com") ||
          url.includes("/citizens/media.aspx") ||
          url.endsWith("#") ||
          url === "javascript:void(0)" ||
          url === "javascript:void(0);" ||
          url.includes("rss")
        );
      }

      function findSectionY(label: string) {
        const candidates = Array.from(
          document.querySelectorAll("h1,h2,h3,h4,h5,h6,div,span,td")
        );

        const match = candidates.find((el) => {
          const text = cleanTextInPage((el as HTMLElement).innerText || el.textContent || "");
          return text.toLowerCase() === label.toLowerCase();
        });

        return match ? yPos(match) : null;
      }

      function meetingDateMatches(text = "") {
        return [
          ...text.matchAll(
            /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)/gi
          ),
          ...text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)/gi)
        ];
      }

      function hasMeetingDate(text = "") {
        return meetingDateMatches(text).length > 0;
      }

      function extractDateTime(rowText: string) {
        const match =
          rowText.match(
            /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)/i
          ) || rowText.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)/i);

        if (!match) return { dateText: null, timeText: null, dateTimeText: null };

        const dateTimeText = match[0];
        const timeMatch = dateTimeText.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i);
        const timeText = timeMatch ? timeMatch[0] : null;
        const dateText = timeText ? cleanTextInPage(dateTimeText.replace(timeText, "")) : dateTimeText;

        return { dateText, timeText, dateTimeText };
      }

      function basicTitleFromRow(rowText: string) {
        const { dateTimeText } = extractDateTime(rowText);
        let title = rowText;
        if (dateTimeText) title = title.replace(dateTimeText, "");

        return title
          .replace(
            /\b(Agenda Packet|Agenda|Minutes|Video|Audio|Captions?|Meeting Details|Calendar|Document)\b/gi,
            " "
          )
          .replace(/Cancelled/gi, " ")
          .replace(/\|/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      function hasUsableMeetingTitle(rowText: string) {
        const title = basicTitleFromRow(rowText);
        return Boolean(title && title.length <= 500);
      }

      function findMeetingContainer(anchor: Element) {
        let candidate: Element | null =
          anchor.closest("tr") ||
          anchor.closest("li") ||
          anchor.closest("[role='row']") ||
          anchor.closest("div");

        for (let index = 0; index < 8 && candidate; index += 1) {
          const text = cleanTextInPage((candidate as HTMLElement).innerText || "");
          if (hasMeetingDate(text) && meetingDateMatches(text).length <= 1 && text.length <= 1000) {
            return candidate;
          }
          candidate = candidate.parentElement;
        }

        return null;
      }

      function sectionForY(elementY: number, upcomingY: number | null, pastY: number | null) {
        if (upcomingY !== null && pastY !== null && elementY > upcomingY && elementY < pastY) {
          return "Upcoming Meetings";
        }

        if (pastY !== null && elementY > pastY) return "Past Meetings";
        if (upcomingY !== null && elementY > upcomingY) return "Upcoming Meetings";
        return "Unknown";
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
          "Document"
        ].includes(type);
      }

      type RowEntry = {
        elementY: number;
        rowText: string;
        meetingDetailsUrl: string | null;
        documents: Array<{ type: string; label: string; url: string }>;
      };

      type LinkEntry = {
        elementY: number;
        type: string;
        label: string;
        url: string;
      };

      function getOrCreateRow(rowMap: Map<string, RowEntry>, container: Element) {
        const rowText = cleanTextInPage((container as HTMLElement).innerText || "");
        if (!rowText || !hasMeetingDate(rowText)) return null;
        if (!hasUsableMeetingTitle(rowText)) return null;

        const key = rowText.slice(0, 700);
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

      const upcomingY = findSectionY("Upcoming Meetings");
      const pastY = findSectionY("Past Meetings");
      const rowMap = new Map<string, RowEntry>();
      const floatingLinks: LinkEntry[] = [];

      for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
        const label = cleanTextInPage((anchor as HTMLElement).innerText || anchor.textContent || "");
        const url = elementUrl(anchor as HTMLAnchorElement);
        if (!url || shouldIgnoreLink(label, url)) continue;

        const type = classifyLink(label, url);
        if (!acceptedDocumentType(type)) continue;

        floatingLinks.push({
          elementY: yPos(anchor),
          type,
          label: label || type,
          url
        });

        const container = findMeetingContainer(anchor);
        if (!container) continue;

        const entry = getOrCreateRow(rowMap, container);
        if (!entry) continue;

        if (type === "Meeting Details") {
          entry.meetingDetailsUrl = url;
          entry.documents.push({ type, label: label || "Meeting Details", url });
        } else {
          entry.documents.push({ type, label: label || type, url });
        }
      }

      for (const container of Array.from(document.querySelectorAll("tr,li,[role='row'],div"))) {
        const rowText = cleanTextInPage((container as HTMLElement).innerText || "");
        if (!rowText || rowText.length > 1400 || !hasMeetingDate(rowText)) continue;
        if (meetingDateMatches(rowText).length > 2) continue;
        getOrCreateRow(rowMap, container);
      }

      const rowEntries = Array.from(rowMap.values()).sort((left, right) => left.elementY - right.elementY);

      for (const link of floatingLinks) {
        let bestEntry: RowEntry | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const entry of rowEntries) {
          const distance = Math.abs(entry.elementY - link.elementY);
          if (distance <= 160 && distance < bestDistance) {
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

        const bodyName = title.includes(" - ") ? title.split(" - ")[0].trim() : title;
        const isCancelled = /cancelled/i.test(entry.rowText);
        const seenDocs = new Set<string>();
        const documents = entry.documents.filter((doc) => {
          const key = `${doc.type}|${doc.label}|${doc.url}`;
          if (seenDocs.has(key)) return false;
          seenDocs.add(key);
          return true;
        });

        const sourceUrl =
          entry.meetingDetailsUrl ||
          documents.find((doc) => doc.type === "Agenda")?.url ||
          documents.find((doc) => doc.type === "Agenda Packet")?.url ||
          jurisdiction.sourceUrl;

        const key = [
          section,
          dateText || "",
          timeText || "",
          title,
          documents.map((doc) => doc.url).sort().join("|")
        ].join("|");

        if (seenMeetingKeys.has(key)) continue;
        seenMeetingKeys.add(key);

        meetings.push({
          jurisdictionName: jurisdiction.name,
          jurisdictionSlug: jurisdiction.slug,
          platform: "iqm2",
          source: jurisdiction.sourceUrl,
          section,
          title: title || bodyName || "Untitled meeting",
          bodyName,
          meetingType: bodyName || title || "Meeting type not listed",
          dateText,
          timeText,
          location: null,
          rowText: entry.rowText,
          status: isCancelled ? "Cancelled" : section === "Upcoming Meetings" ? "Upcoming" : "Past",
          sourceUrl,
          meetingDetailsUrl: entry.meetingDetailsUrl,
          hasHtmlAgenda: false,
          hasPdf: documents.some((doc) =>
            ["Agenda", "Agenda Packet", "Document"].includes(doc.type)
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
        sourceUrl: jurisdiction.sourceUrl
      }
    }
  )) as Iqm2Meeting[];
}

async function extractLinksFromDetailPage(page: Page) {
  await page.evaluate("globalThis.__name = (value) => value");

  return page.evaluate(() => {
    function cleanTextInPage(text = "") {
      return text.replace(/\s+/g, " ").trim();
    }

    function absoluteUrl(href: string | null) {
      if (!href) return null;

      try {
        const url = new URL(href, window.location.href);
        if (!["http:", "https:"].includes(url.protocol)) return null;
        return url.toString();
      } catch {
        return null;
      }
    }

    function urlFromOnclick(onclick: string | null) {
      if (!onclick) return null;

      const match =
        onclick.match(/OpenWindow\(\s*['"]([^'"]+)['"]/i) ||
        onclick.match(/window\.open\(\s*['"]([^'"]+)['"]/i);

      return absoluteUrl(match?.[1] || null);
    }

    function elementUrl(element: Element) {
      return urlFromOnclick(element.getAttribute("onclick")) ||
        absoluteUrl(element.getAttribute("href"));
    }

    return Array.from(document.querySelectorAll("a[href], [onclick]"))
      .map((element) => ({
        label: cleanTextInPage((element as HTMLElement).innerText || element.textContent || ""),
        url: elementUrl(element)
      }))
      .filter((link): link is { label: string; url: string } => Boolean(link.url));
  });
}

export async function enrichIqm2MeetingDetails(
  context: BrowserContext,
  meeting: PrimeGovMeeting,
  log: (message: string) => void
) {
  const iqm2Meeting = meeting as Iqm2Meeting;
  if (!iqm2Meeting.meetingDetailsUrl) return;

  const page = await context.newPage();

  try {
    await page.goto(iqm2Meeting.meetingDetailsUrl, {
      waitUntil: "networkidle",
      timeout: 60000
    });
    await page.waitForTimeout(1500);

    iqm2Meeting.detailText = cleanText(await page.locator("body").innerText());
    const links = await extractLinksFromDetailPage(page);

    const detailDocuments: Iqm2Document[] = [];
    for (const link of links) {
      if (shouldIgnoreIqm2Link(link.label, link.url)) continue;
      const type = classifyIqm2Link(link.label, link.url);
      if (!ENRICHABLE_DOCUMENT_TYPES.has(type)) continue;

      detailDocuments.push({
        type,
        label: link.label || type,
        url: link.url,
        jurisdictionName: meeting.jurisdictionName,
        jurisdictionSlug: meeting.jurisdictionSlug,
        platform: meeting.platform
      } as Iqm2Document);
    }

    iqm2Meeting.documents = dedupeDocuments([
      ...(iqm2Meeting.documents as Iqm2Document[]),
      ...detailDocuments
    ]);
    iqm2Meeting.hasPdf = iqm2Meeting.documents.some((doc) =>
      ["Agenda", "Agenda Packet", "Document"].includes(doc.type)
    );

    log(`Enriched IQM2 detail page for ${meeting.title}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown IQM2 detail page error";
    meeting.extractionNotes = [
      ...(meeting.extractionNotes || []),
      `IQM2 detail page enrichment failed: ${message}`
    ];
    log(`IQM2 detail page enrichment failed for ${meeting.title}: ${message}`);
  } finally {
    await page.close();
  }
}

export function buildIqm2DownloadFilename(meeting: PrimeGovMeeting, docType: string, sourceUrl: string) {
  let documentId = "unknown-id";

  try {
    const parsed = new URL(sourceUrl);
    documentId =
      parsed.searchParams.get("FileID") ||
      parsed.searchParams.get("ID") ||
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

export async function scrapeIqm2Meetings(
  options: ScrapeIqm2Options
): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const jurisdiction = options.jurisdiction;
  const portalUrl = options.portalUrl || jurisdiction.iqm2Url || jurisdiction.sourceUrl;

  const browser = await chromium.launch({
    headless: !options.headful
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 SimpleCity IQM2 scraper",
    viewport: {
      width: 1600,
      height: 1200
    },
    baseURL: IQM2_ORIGIN
  });

  const page = await context.newPage();

  try {
    log("Opening IQM2 portal...");
    await waitForIqm2Portal(page, portalUrl);

    if (options.clickSeeMore) {
      await clickVisibleSeeMoreLinks(page, log);
    }

    log("Scraping IQM2 meeting rows...");
    let meetings = dedupeIqm2Meetings(await extractVisibleIqm2Meetings(page, jurisdiction));
    if (!options.allVisible) {
      meetings = filterMeetingsToWindow(meetings, options);
      log(
        `IQM2 meetings in configured window (${options.monthsBack ?? 1} month(s) back, ${options.monthsForward ?? 1} month(s) forward): ${meetings.length}.`
      );
    }
    if (typeof options.limit === "number" && options.limit > 0) {
      meetings = meetings.slice(0, options.limit);
    }

    applyJurisdictionMetadata(meetings, jurisdiction);

    const upcomingCount = countByStatus(meetings, "Upcoming");
    const pastCount = countByStatus(meetings, "Past");
    const cancelledCount = countByStatus(meetings, "Cancelled");

    log(`Found ${upcomingCount} upcoming IQM2 meetings.`);
    log(`Found ${pastCount} past IQM2 meetings.`);
    log(`Found ${cancelledCount} cancelled IQM2 meetings.`);

    if (meetings.length === 0) {
      log("No IQM2 meetings were found on the visible portal page.");
    }

    if (options.enrichDetails ?? true) {
      log("Enriching IQM2 meeting detail pages where available...");
      for (const meeting of meetings) {
        if (options.shouldStop?.()) {
          log("Stopping IQM2 detail enrichment early because the pipeline deadline is near.");
          break;
        }

        await enrichIqm2MeetingDetails(context, meeting, log);
      }
    }

    if (options.downloadDocuments) {
      const { downloadIqm2Documents } = await import("@/lib/scraper/downloadDocuments");
      log("Downloading IQM2 documents where available...");
      await downloadIqm2Documents(context, meetings, {
        log,
        outputDir: options.documentOutputDir,
        shouldStop: options.shouldStop
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
