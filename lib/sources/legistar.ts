import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type { LegistarItem, PrimeGovDocument, PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { cleanText, slugify } from "@/lib/utils/slug";
import { parseMeetingDate } from "@/lib/utils/date";
import { filterMeetingsToWindow } from "@/lib/utils/meetingWindow";
import { mergeDiscoveredAgendaItemAttachments } from "@/lib/scraper/itemAttachments";

const DEFAULT_LEGISTAR_URL = "https://sanmateocounty.legistar.com/Calendar.aspx";

const DOWNLOADABLE_DOCUMENT_TYPES = new Set([
  "Agenda",
  "Accessible Agenda",
  "Agenda Packet",
  "Minutes",
  "Accessible Minutes",
  "Notice of Cancellation",
  "Document"
]);

export type ScrapeLegistarOptions = ScrapePortalOptions & {
  jurisdiction: JurisdictionConfig;
  enrichDetails?: boolean;
  enrichLegislation?: boolean;
  clickSeeMore?: boolean;
  limit?: number;
  maxItemsPerMeeting?: number;
};

export function shouldEnrichLegistarAgendaAttachments(
  options: Pick<ScrapeLegistarOptions, "enrichAgendaAttachments" | "enrichLegislation">
) {
  return options.enrichAgendaAttachments ?? options.enrichLegislation ?? true;
}

type LegistarDocument = PrimeGovDocument;

type LegistarMeeting = PrimeGovMeeting & {
  meetingDetailsUrl?: string | null;
  detailText?: string | null;
  documents: LegistarDocument[];
  items?: LegistarItem[];
};

function dedupeDocuments(documents: LegistarDocument[]) {
  const seen = new Set<string>();
  const result: LegistarDocument[] = [];

  for (const doc of documents) {
    const key = `${doc.type}|${doc.url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(doc);
  }

  return result;
}

function countByStatus(meetings: PrimeGovMeeting[], status: string) {
  return meetings.filter((meeting) => meeting.status === status).length;
}

function getUrlIdentity(url: string | null | undefined) {
  if (!url) return { id: null as string | null, guid: null as string | null };

  try {
    const parsed = new URL(url);
    return {
      id: parsed.searchParams.get("ID"),
      guid: parsed.searchParams.get("GUID")
    };
  } catch {
    return { id: null, guid: null };
  }
}

export function makeLegistarMeetingExternalId(
  jurisdictionSlug: string,
  meetingDetailsUrl: string | null | undefined,
  fallback: string
) {
  const { id, guid } = getUrlIdentity(meetingDetailsUrl);
  if (id || guid) {
    return [jurisdictionSlug, "legistar-meeting", id, guid]
      .filter(Boolean)
      .join(":")
      .toLowerCase();
  }

  return slugify(`${jurisdictionSlug}-legistar-meeting-${fallback}`);
}

function legistarMeetingMergeKey(meeting: LegistarMeeting) {
  const { id, guid } = getUrlIdentity(meeting.meetingDetailsUrl);

  if (id || guid) {
    return [
      meeting.jurisdictionSlug || "legistar",
      "legistar",
      id,
      guid
    ]
      .filter(Boolean)
      .join("-");
  }

  return [
    meeting.jurisdictionSlug || "legistar",
    meeting.bodyName || meeting.meetingType || meeting.title,
    meeting.dateText || "",
    meeting.timeText || ""
  ]
    .join("|")
    .toLowerCase();
}

function hasCancellationSignal(meeting: LegistarMeeting) {
  return (
    /\b(cancelled|canceled)\b/i.test(`${meeting.title} ${meeting.rowText}`) ||
    meeting.documents.some((doc) => doc.type === "Notice of Cancellation")
  );
}

function mergeLegistarMeetings(meetings: LegistarMeeting[]) {
  const byKey = new Map<string, LegistarMeeting>();

  for (const meeting of meetings) {
    const key = legistarMeetingMergeKey(meeting);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, meeting);
      continue;
    }

    const upcoming =
      existing.section === "Upcoming Meetings" ||
      meeting.section === "Upcoming Meetings";
    const cancelled = hasCancellationSignal(existing) || hasCancellationSignal(meeting);
    const existingTitle = existing.title || "";
    const meetingTitle = meeting.title || "";
    const existingLocation = existing.location || "";
    const meetingLocation = meeting.location || "";

    byKey.set(key, {
      ...existing,
      section: upcoming ? "Upcoming Meetings" : existing.section,
      status: cancelled ? "Cancelled" : upcoming ? "Upcoming" : "Past",
      title: meetingTitle.length > existingTitle.length ? meeting.title : existing.title,
      location:
        meetingLocation.length > existingLocation.length ? meeting.location : existing.location,
      sourceUrl: existing.sourceUrl || meeting.sourceUrl,
      meetingDetailsUrl: existing.meetingDetailsUrl || meeting.meetingDetailsUrl,
      documents: dedupeDocuments([...existing.documents, ...meeting.documents]),
      items: [...(existing.items || []), ...(meeting.items || [])]
    });
  }

  return [...byKey.values()];
}

function inferLegistarMeetingStatus(meeting: LegistarMeeting): LegistarMeeting {
  if (meeting.status === "Cancelled" || hasCancellationSignal(meeting)) {
    return {
      ...meeting,
      status: "Cancelled"
    };
  }

  if (meeting.section !== "Unknown") return meeting;

  const dateTimeText = [meeting.dateText, meeting.timeText].filter(Boolean).join(" ");
  const meetingIso = parseMeetingDate(dateTimeText);
  if (!meetingIso) return meeting;

  const isPast = new Date(meetingIso).getTime() < Date.now();
  return {
    ...meeting,
    section: isPast ? "Past Meetings" : "Upcoming Meetings",
    status: isPast ? "Past" : "Upcoming"
  };
}

function makeLegistarItemExternalId(sourceUrl: string, fallback: string) {
  const { id, guid } = getUrlIdentity(sourceUrl);

  if (id || guid) {
    return ["legistar-item", id, guid].filter(Boolean).join("-");
  }

  return slugify(`legistar-item-${fallback || sourceUrl}`);
}

function formatLegistarItems(items: LegistarItem[] = []) {
  if (items.length === 0) return "";

  const lines = ["Meeting Items:"];
  for (const item of items) {
    lines.push(
      [
        item.agendaNumber ? `Agenda # ${item.agendaNumber}` : null,
        item.fileNumber ? `File # ${item.fileNumber}` : null,
        item.itemType,
        item.title
      ]
        .filter(Boolean)
        .join(" | ")
    );

    if (item.action) lines.push(`Action: ${item.action}`);
    if (item.result) lines.push(`Result: ${item.result}`);
    if (item.recommendedAction) lines.push(`Recommended Action: ${item.recommendedAction}`);
    if (item.legislationText) lines.push(`Legislation Text: ${item.legislationText}`);
    lines.push(`Source: ${item.sourceUrl}`);
  }

  return lines.join("\n");
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(values[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, values.length)) }, () => worker())
  );

  return results;
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
  const text = cleanText(label).toLowerCase();
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
    text.includes("export to icalendar") ||
    text.includes("export to excel") ||
    text.includes("export to pdf") ||
    text.includes("export to word") ||
    text.includes("city home") ||
    text.includes("search files") ||
    text.includes("skip to main content") ||
    text.includes("prior council meeting documents") ||
    text.includes("prior advisory body meeting documents") ||
    text === "meetings" ||
    text === "help" ||
    text === "not available" ||
    text === "home" ||
    url.includes("calendar.aspx?eid=") ||
    url.includes("#") ||
    url.endsWith("#") ||
    url.startsWith("javascript:")
  );
}

function isLegistarViewUrl(url: string) {
  try {
    return new URL(url).pathname.toLowerCase().includes("/view.ashx");
  } catch {
    return false;
  }
}

function shouldDownloadLegistarDocument(doc: LegistarDocument) {
  if (doc.isAgendaItemAttachment) return true;
  if (DOWNLOADABLE_DOCUMENT_TYPES.has(doc.type)) return true;
  return doc.type === "Media" && isLegistarViewUrl(doc.url);
}

export function classifyLegistarLink(label = "", href = ""): LegistarDocument["type"] {
  const text = cleanText(label).toLowerCase();
  const url = href.toLowerCase();

  if (
    text.includes("meeting cancellation notice") ||
    text.includes("cancellation notice")
  ) {
    return "Notice of Cancellation";
  }

  if (text.includes("accessible agenda")) return "Accessible Agenda";
  if (text.includes("agenda packet") || text.includes("packet")) return "Agenda Packet";
  if (text === "agenda" || text.includes("agenda")) return "Agenda";
  if (text.includes("accessible minutes")) return "Accessible Minutes";
  if (text.includes("minutes")) return "Minutes";
  if (text.includes("meeting detail") || url.includes("meetingdetail.aspx")) return "Meeting Details";
  if (
    text.includes("media") ||
    text.includes("video") ||
    url.includes("video.aspx") ||
    url.includes("mediaplayer") ||
    url.includes("granicus.com") ||
    url.includes("swagit.com") ||
    url.includes("mode=granicus")
  ) return "Media";
  if (text.includes("audio")) return "Audio";
  if (text.includes("caption") || text.includes("transcript")) return "Captions";
  if (text.includes("calendar") || text.includes("icalendar")) return "Calendar";
  if (url.includes("view.ashx") || url.includes(".pdf") || url.includes("document")) return "Document";

  return "Other";
}

function acceptedDocumentType(type: string) {
  return [
    "Agenda",
    "Accessible Agenda",
    "Agenda Packet",
    "Minutes",
    "Accessible Minutes",
    "Notice of Cancellation",
    "Media",
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
  options: {
    outputDir?: string;
    log?: (message: string) => void;
    shouldStop?: () => boolean;
    monthsBack?: number;
  } = {}
) {
  const docsDir = options.outputDir || path.join(process.cwd(), "scraped-primegov");
  const log = options.log || (() => undefined);
  let downloaded = 0;
  let failed = 0;

  await fs.mkdir(docsDir, { recursive: true });

  for (const meeting of meetings) {
    const docs = meeting.documents.filter(
      (document) =>
        shouldDownloadLegistarDocument(document) &&
        shouldDownloadLegistarDocumentForWindow(document, options.monthsBack)
    );

    for (const doc of docs) {
      if (options.shouldStop?.()) {
        log("Stopping Legistar document downloads early because the pipeline deadline is near.");
        return { downloaded, failed };
      }

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

export function shouldDownloadLegistarDocumentForWindow(
  document: PrimeGovDocument,
  monthsBack = 1
) {
  return (
    monthsBack <= 1 ||
    ["Agenda", "Accessible Agenda", "Minutes", "Accessible Minutes", "Notice of Cancellation"].includes(
      document.type
    )
  );
}

async function scrapeLegistarDetails(context: BrowserContext, meeting: LegistarMeeting, log: (message: string) => void) {
  const detailUrl = meeting.meetingDetailsUrl;
  if (!detailUrl) return;

  const page = await context.newPage();

  try {
    await page.goto(detailUrl, {
      waitUntil: "networkidle",
      timeout: 60000
    });
    await page.evaluate("globalThis.__name = (value) => value");
    await page.waitForTimeout(1500);

    const detail = await page.evaluate(() => {
      function cleanTextInPage(value = "") {
        return value.replace(/\s+/g, " ").trim();
      }

      function cleanMultiline(value = "") {
        return value
          .replace(/\r/g, "\n")
          .replace(/[ \t]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      function anchorLabel(anchor: HTMLAnchorElement) {
        const image = anchor.querySelector("img");

        return cleanTextInPage(
          anchor.innerText ||
            anchor.textContent ||
            image?.getAttribute("alt") ||
            image?.getAttribute("title") ||
            anchor.getAttribute("title") ||
            ""
        );
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
          onclick.match(/window\.open\(\s*['"]([^'"]+)['"]/i) ||
          onclick.match(/OpenWindow\(\s*['"]([^'"]+)['"]/i);

        return absoluteUrl(match?.[1] || null);
      }

      function elementUrl(anchor: HTMLAnchorElement) {
        return urlFromOnclick(anchor.getAttribute("onclick")) ||
          absoluteUrl(anchor.getAttribute("href"));
      }

      function normalizeHeader(value = "") {
        return cleanTextInPage(value).toLowerCase().replace(/\s+/g, " ");
      }

      const links = Array.from(document.querySelectorAll("a[href]"))
        .map((anchor) => ({
          label: anchorLabel(anchor as HTMLAnchorElement),
          href: elementUrl(anchor as HTMLAnchorElement)
        }))
        .filter((link): link is { label: string; href: string } => Boolean(link.href));

      const itemAnchors = Array.from(
        document.querySelectorAll('a[href*="LegislationDetail.aspx"]')
      ) as HTMLAnchorElement[];
      const seenItemUrls = new Set<string>();
      const items = [];

      for (const itemAnchor of itemAnchors) {
        const sourceUrl = elementUrl(itemAnchor);
        if (!sourceUrl || seenItemUrls.has(sourceUrl)) continue;
        seenItemUrls.add(sourceUrl);

        const row = itemAnchor.closest("tr");
        if (!row) continue;

        const table = row.closest("table");
        const headerRow = table
          ? Array.from(table.querySelectorAll("tr")).find((candidate) => {
              const text = cleanTextInPage((candidate as HTMLElement).innerText || "").toLowerCase();
              return text.includes("file") && text.includes("title");
            })
          : null;

        const headers = headerRow
          ? Array.from(headerRow.querySelectorAll("th,td")).map((cell) =>
              normalizeHeader((cell as HTMLElement).innerText || cell.textContent || "")
            )
          : [];
        const cells = Array.from(row.querySelectorAll(":scope > td")) as HTMLTableCellElement[];
        const cellTexts = cells.map((cell) =>
          cleanTextInPage(cell.innerText || cell.textContent || "")
        );

        function valueForHeader(candidates: string[]) {
          for (const candidate of candidates) {
            const index = headers.findIndex(
              (header) => header === candidate || header.includes(candidate)
            );

            if (index >= 0 && cellTexts[index]) {
              return cellTexts[index];
            }
          }

          return null;
        }

        items.push({
          fileNumber:
            cleanTextInPage(itemAnchor.innerText || itemAnchor.textContent || "") ||
            valueForHeader(["file #", "file"]),
          agendaNumber: valueForHeader(["agenda #", "agenda"]),
          itemType: valueForHeader(["type"]),
          title: valueForHeader(["title"]),
          action: valueForHeader(["action"]),
          result: valueForHeader(["result", "action details"]),
          sourceUrl,
          rowText: cleanTextInPage((row as HTMLElement).innerText || "")
        });
      }

      return {
        bodyText: cleanMultiline(document.body.innerText || ""),
        links,
        items
      };
    });

    const detailDocs: LegistarDocument[] = [];

    for (const link of detail.links) {
      const url = link.href;
      if (shouldIgnoreLink(link.label, url)) continue;
      const type = classifyLegistarLink(link.label, url);
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

    const items = detail.items.map((item) => ({
      ...item,
      externalId: makeLegistarItemExternalId(
        item.sourceUrl,
        [item.fileNumber, item.agendaNumber, item.title].filter(Boolean).join("-")
      )
    }));

    meeting.items = items;
    meeting.detailText = cleanText([detail.bodyText, formatLegistarItems(items)].filter(Boolean).join("\n\n"));
    meeting.documents = dedupeDocuments([...meeting.documents, ...detailDocs]);
    meeting.hasPdf = meeting.documents.some((doc) =>
      ["Agenda", "Accessible Agenda", "Agenda Packet", "Document", "Minutes", "Accessible Minutes"].includes(doc.type)
    );

    log(`Enriched Legistar detail page for ${meeting.title}; captured ${items.length} meeting items.`);
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

async function enrichLegislationItem(context: BrowserContext, item: LegistarItem): Promise<LegistarItem> {
  const page = await context.newPage();

  try {
    await page.goto(item.sourceUrl, {
      waitUntil: "networkidle",
      timeout: 60000
    });
    await page.evaluate("globalThis.__name = (value) => value");
    await page.waitForTimeout(1000);

    const detail = await page.evaluate(() => {
      function cleanTextInPage(value = "") {
        return value.replace(/\s+/g, " ").trim();
      }

      function cleanMultiline(value = "") {
        return value
          .replace(/\r/g, "\n")
          .replace(/[ \t]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      function htmlToText(html = "") {
        return cleanMultiline(
          html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(p|div|li|tr|td|th|h1|h2|h3|h4|h5|h6)>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
        );
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

      function extractBlock(bodyText: string, label: string, stopLabels: string[]) {
        const lower = bodyText.toLowerCase();
        const start = lower.lastIndexOf(label.toLowerCase());
        if (start < 0) return null;

        const contentStart = start + label.length;
        let end = bodyText.length;

        for (const stopLabel of stopLabels) {
          const stopIndex = lower.indexOf(stopLabel.toLowerCase(), contentStart);
          if (stopIndex >= 0 && stopIndex < end) end = stopIndex;
        }

        return cleanMultiline(bodyText.slice(contentStart, end)) || null;
      }

      const visibleText = cleanMultiline(document.body.innerText || "");
      const bodyText = cleanMultiline(
        `${visibleText}\n\n${htmlToText(document.documentElement.innerHTML || "")}`
      );
      const fileNumber = bodyText.match(/File #:\s*([^\s]+)/i)?.[1] || null;
      const itemType = bodyText.match(/Type:\s*(.+?)\s+Status:/i)?.[1]?.trim() || null;
      const status =
        bodyText.match(/Status:\s*(.+?)\s+Meeting Body:/i)?.[1]?.trim() ||
        bodyText.match(/Status:\s*(.+?)\s+On agenda:/i)?.[1]?.trim() ||
        null;
      const meetingBody = bodyText.match(/Meeting Body:\s*(.+?)\s+On agenda:/i)?.[1]?.trim() || null;
      const onAgenda = bodyText.match(/On agenda:\s*([^\n]+)/i)?.[1]?.trim() || null;
      const title = extractBlock(bodyText, "Title:", ["Attachments:", "History", "Text"]);
      const recommendedAction = extractBlock(bodyText, "Recommended Action", [
        "Legislation Text",
        "Legislation Details"
      ]);
      const legislationText = extractBlock(bodyText, "Legislation Text", ["Legislation Details"]);
      const attachments = Array.from(document.querySelectorAll("a[href]"))
        .map((anchor) => {
          const element = anchor as HTMLAnchorElement;
          const image = element.querySelector("img");
          const label = cleanTextInPage(
            element.innerText ||
              element.textContent ||
              image?.getAttribute("alt") ||
              image?.getAttribute("title") ||
              ""
          );
          const url = absoluteUrl(element.getAttribute("href"));

          return {
            type: "Attachment" as const,
            label,
            url
          };
        })
        .filter(
          (attachment): attachment is { type: "Attachment"; label: string; url: string } =>
            Boolean(
              attachment.url &&
                attachment.label &&
                attachment.url.toLowerCase().includes("view.ashx")
            )
        );

      return {
        fileNumber,
        itemType,
        status,
        meetingBody,
        onAgenda,
        title,
        recommendedAction,
        legislationText,
        attachments
      };
    });

    return {
      ...item,
      fileNumber: detail.fileNumber || item.fileNumber,
      itemType: detail.itemType || item.itemType,
      title: item.title || detail.title,
      status: detail.status,
      meetingBody: detail.meetingBody,
      onAgenda: detail.onAgenda,
      recommendedAction: detail.recommendedAction,
      legislationText: detail.legislationText,
      attachments: detail.attachments
    };
  } catch (error) {
    return {
      ...item,
      extractionError: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await page.close();
  }
}

async function extractVisibleLegistarMeetings(
  page: Page,
  jurisdiction: JurisdictionConfig
): Promise<LegistarMeeting[]> {
  await page.evaluate("globalThis.__name = (value) => value");

  const rawMeetings = (await page.evaluate(
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
          onclick.match(/window\.open\(\s*['"]([^'"]+)['"]/i) ||
          onclick.match(/OpenWindow\(\s*['"]([^'"]+)['"]/i);

        return absoluteUrl(match?.[1] || null);
      }

      function elementUrl(anchor: HTMLAnchorElement) {
        return urlFromOnclick(anchor.getAttribute("onclick")) ||
          absoluteUrl(anchor.getAttribute("href"));
      }

      function anchorLabel(anchor: HTMLAnchorElement) {
        const image = anchor.querySelector("img");

        return cleanTextInPage(
          anchor.innerText ||
            anchor.textContent ||
            image?.getAttribute("alt") ||
            image?.getAttribute("title") ||
            anchor.getAttribute("title") ||
            ""
        );
      }

      function getDirectCells(row: HTMLTableRowElement) {
        const direct = Array.from(row.querySelectorAll(":scope > td")) as HTMLTableCellElement[];
        return direct.length > 0 ? direct : Array.from(row.cells);
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
        const text = cleanTextInPage(label).toLowerCase();
        const url = href.toLowerCase();

        if (
          text.includes("meeting cancellation notice") ||
          text.includes("cancellation notice")
        ) {
          return "Notice of Cancellation";
        }

        if (text.includes("accessible agenda")) return "Accessible Agenda";
        if (text.includes("agenda packet") || text.includes("packet")) return "Agenda Packet";
        if (text === "agenda" || text.includes("agenda")) return "Agenda";
        if (text.includes("accessible minutes")) return "Accessible Minutes";
        if (text.includes("minutes")) return "Minutes";
        if (text.includes("meeting detail") || url.includes("meetingdetail.aspx")) return "Meeting Details";
        if (
          text.includes("media") ||
          text.includes("video") ||
          url.includes("video.aspx") ||
          url.includes("mediaplayer") ||
          url.includes("granicus.com") ||
          url.includes("swagit.com") ||
          url.includes("mode=granicus")
        ) return "Media";
        if (text.includes("audio")) return "Audio";
        if (text.includes("caption") || text.includes("transcript")) return "Captions";
        if (text.includes("calendar") || text.includes("icalendar")) return "Calendar";
        if (url.includes("view.ashx") || url.includes(".pdf") || url.includes("document")) return "Document";

        return "Other";
      }

      function shouldIgnoreLink(label = "", href = "") {
        const text = cleanTextInPage(label).toLowerCase();
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
          text.includes("export to icalendar") ||
          text.includes("export to excel") ||
          text.includes("export to pdf") ||
          text.includes("export to word") ||
          text.includes("city home") ||
          text.includes("search files") ||
          text.includes("skip to main content") ||
          text.includes("prior council meeting documents") ||
          text.includes("prior advisory body meeting documents") ||
          text === "meetings" ||
          text === "help" ||
          text === "not available" ||
          text === "home" ||
          url.includes("calendar.aspx?eid=") ||
          url.includes("#") ||
          url.endsWith("#") ||
          url.startsWith("javascript:")
        );
      }

      function acceptedDocumentType(type: string) {
        return [
          "Agenda",
          "Accessible Agenda",
          "Agenda Packet",
          "Minutes",
          "Accessible Minutes",
          "Notice of Cancellation",
          "Media",
          "Audio",
          "Captions",
          "Meeting Details",
          "Calendar",
          "Document"
        ].includes(type);
      }

      function isMeetingCancelled(title = "", rowText = "", documents: Array<{ type: string }> = []) {
        return (
          /\b(cancelled|canceled)\b/i.test(`${title} ${rowText}`) ||
          documents.some((doc) => doc.type === "Notice of Cancellation")
        );
      }

      function findHeadingY(exactText: string) {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, div, span, td"));
        const matches = headings.filter((el) => {
          const text = cleanTextInPage(((el as HTMLElement).innerText || el.textContent || ""));
          return text.toLowerCase() === exactText.toLowerCase();
        });

        matches.sort((left, right) => left.children.length - right.children.length);
        return matches[0] ? yPos(matches[0]) : null;
      }

      function sectionForY(elementY: number, upcomingY: number | null, pastY: number | null, allY: number | null) {
        const archiveY = allY ?? pastY;

        if (upcomingY !== null && archiveY !== null && elementY > upcomingY && elementY < archiveY) {
          return "Upcoming Meetings";
        }

        if (allY !== null && elementY > allY) return "All Meetings";
        if (pastY !== null && elementY > pastY) return "Past Meetings";
        if (upcomingY !== null && elementY > upcomingY) return "Upcoming Meetings";
        return "Unknown";
      }

      type RowEntry = {
        elementY: number;
        rowText: string;
        meetingDetailsUrl: string | null;
        bodyName: string | null;
        title: string | null;
        location: string | null;
        dateText: string | null;
        timeText: string | null;
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
            bodyName: null,
            title: null,
            location: null,
            dateText,
            timeText: null,
            documents: []
          });
        }

        return rowMap.get(key) || null;
      }

      function applyTableCellMetadata(entry: RowEntry, row: HTMLTableRowElement) {
        const cells = getDirectCells(row);
        if (cells.length === 0) return;

        const cellTexts = cells.map((cell) => cleanTextInPage(cell.innerText || cell.textContent || ""));
        const detailsIndex = cells.findIndex((cell) =>
          Boolean(cell.querySelector('a[href*="MeetingDetail.aspx"]'))
        );
        const dateIndex = cellTexts.findIndex((text) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text));
        const timeIndex = cellTexts.findIndex((text) => /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(text));
        const locationCell = detailsIndex > 0 ? cells[detailsIndex - 1] : null;
        const fullLocationText = locationCell
          ? cleanTextInPage(locationCell.innerText || locationCell.textContent || "")
          : "";
        const descriptionElement = locationCell?.querySelector("em,i") || null;
        const description = descriptionElement
          ? cleanTextInPage(
              (descriptionElement as HTMLElement).innerText ||
                descriptionElement.textContent ||
                ""
            )
          : "";
        const location = description
          ? cleanTextInPage(fullLocationText.replace(description, ""))
          : fullLocationText;

        entry.bodyName = entry.bodyName || cellTexts[0] || null;
        entry.title = description || entry.title || entry.bodyName;
        entry.location = location || entry.location;
        entry.dateText = dateIndex >= 0 ? cellTexts[dateIndex] : entry.dateText;
        entry.timeText = timeIndex >= 0 ? cellTexts[timeIndex] : entry.timeText;
      }

      const upcomingY =
        findHeadingY("Upcoming Meetings") ||
        findHeadingY("Current Meetings") ||
        findHeadingY("Current And Upcoming Meetings");
      const pastY = findHeadingY("Past Meetings") || findHeadingY("Archived Meetings");
      const allY = findHeadingY("All Meetings");

      const rowMap = new Map<string, RowEntry>();
      const floatingLinks: Array<{ elementY: number; type: string; label: string; url: string }> =
        [];

      for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
        const label = anchorLabel(anchor as HTMLAnchorElement);
        const url = elementUrl(anchor as HTMLAnchorElement);
        if (!url || shouldIgnoreLink(label, url)) continue;

        const type = classifyLink(label, url);
        if (!acceptedDocumentType(type)) continue;

        const container =
          anchor.closest("tr") ||
          anchor.closest("li") ||
          anchor.closest("[role='row']") ||
          anchor.closest("div");

        const entry = container ? getOrCreateRow(rowMap, container) : null;
        if (!entry) {
          floatingLinks.push({
            elementY: yPos(anchor),
            type,
            label: label || type,
            url
          });
          continue;
        }

        if (type === "Meeting Details") {
          entry.meetingDetailsUrl = url;
        }

        const row = anchor.closest("tr") as HTMLTableRowElement | null;
        if (row) applyTableCellMetadata(entry, row);

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
        if (!entry.meetingDetailsUrl) continue;

        const { dateText: extractedDateText, timeText: extractedTimeText, dateTimeText } = extractDateTime(entry.rowText);
        const dateText = entry.dateText || extractedDateText;
        const timeText = entry.timeText || extractedTimeText;
        const section = sectionForY(entry.elementY, upcomingY, pastY, allY);
        const rowPrefix = dateTimeText ? entry.rowText.split(dateTimeText)[0] : entry.rowText;
        const derivedBodyName = cleanTextInPage(
          rowPrefix
            .replace(/\bMeeting details\b/gi, " ")
            .replace(/\bAgenda\b/gi, " ")
            .replace(/\bAccessible Agenda\b/gi, " ")
            .replace(/\bAgenda Packet\b/gi, " ")
            .replace(/\bAccessible Minutes\b/gi, " ")
            .replace(/\bVideo\b/gi, " ")
            .replace(/\bMedia\b/gi, " ")
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
            /\b(Notice of Cancellation|Meeting Cancellation Notice|Cancellation Notice|Accessible Agenda|Agenda Packet|Agenda|Accessible Minutes|Minutes|Media|Video|Audio|Captions?|Meeting Details|Calendar|Document)\b/gi,
            " "
          )
          .replace(/Cancelled|Canceled/gi, " ")
          .replace(/\|/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        title = entry.title || title;
        if (!title || title.length > 500) continue;

        const bodyName =
          entry.bodyName ||
          derivedBodyName ||
          (title.includes(" - ") ? title.split(" - ")[0].trim() : title);
        const seenDocKeys = new Set<string>();
        const documents = (entry.documents as Array<{ type: string; label: string; url: string }>).filter(
          (doc: { type: string; label: string; url: string }) => {
            if (doc.type === "Meeting Details" || doc.type === "Calendar" || doc.type === "Other") return false;
            const key = `${doc.type}|${doc.url.toLowerCase()}`;
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
            (doc: { type: string; label: string; url: string }) => doc.type === "Accessible Agenda"
          )?.url ||
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
          location: entry.location || null,
          rowText: entry.rowText,
          status: isMeetingCancelled(title, entry.rowText, documents)
            ? "Cancelled"
            : section === "Past Meetings" || section === "All Meetings"
              ? "Past"
              : "Upcoming",
          sourceUrl,
          meetingDetailsUrl: entry.meetingDetailsUrl,
          hasHtmlAgenda: documents.some((doc: { type: string }) => doc.type === "Accessible Agenda"),
          hasPdf: documents.some((doc: { type: string }) =>
            ["Agenda", "Accessible Agenda", "Agenda Packet", "Document", "Minutes", "Accessible Minutes"].includes(doc.type)
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

  return mergeLegistarMeetings(rawMeetings)
    .map(inferLegistarMeetingStatus)
    .map((meeting) => ({
      ...meeting,
      externalId: makeLegistarMeetingExternalId(
        jurisdiction.slug,
        meeting.meetingDetailsUrl,
        [meeting.dateText, meeting.timeText, meeting.bodyName || meeting.title]
          .filter(Boolean)
          .join(" ")
      )
    }));
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

    if ((options.monthsBack ?? 1) > 1 || options.allVisible) {
      const arrow = page.locator("#ctl00_ContentPlaceHolder1_lstYears_Arrow");
      if (await arrow.count()) {
        await arrow.click();
        const thisYear = page.locator("#ctl00_ContentPlaceHolder1_lstYears_DropDown li", {
          hasText: /^This Year$/
        });
        if (await thisYear.count()) {
          await thisYear.click();
          const search = page.locator("#ctl00_ContentPlaceHolder1_btnSearch");
          if (await search.count()) {
            await search.click();
          }
          await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
          await page.waitForTimeout(1000);
          log("Expanded Legistar from This Month to This Year before applying the date window.");
        }
      }
    }

    log("Scraping Legistar meeting rows...");
    let meetings = await extractVisibleLegistarMeetings(page, jurisdiction);

    if (!options.allVisible) {
      meetings = filterMeetingsToWindow(meetings, options) as LegistarMeeting[];
      log(
        `Legistar meetings in configured window (${options.monthsBack ?? 1} month(s) back, ${options.monthsForward ?? 1} month(s) forward): ${meetings.length}.`
      );
    }

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
      meetings = await mapLimit(meetings as LegistarMeeting[], 4, async (meeting) => {
        if (options.shouldStop?.()) {
          log("Stopping Legistar meeting detail enrichment early because the pipeline deadline is near.");
          return meeting;
        }

        await scrapeLegistarDetails(context, meeting, log);
        return meeting;
      });
    }

    if (shouldEnrichLegistarAgendaAttachments(options)) {
      log("Enriching Legistar legislation detail pages where available...");
      meetings = await mapLimit(meetings as LegistarMeeting[], 2, async (meeting) => {
        if (options.shouldStop?.()) {
          log("Stopping Legistar legislation detail enrichment early because the pipeline deadline is near.");
          return meeting;
        }

        const items = meeting.items || [];
        const limit = options.maxItemsPerMeeting ?? items.length;
        const limitedItems = items.slice(0, limit);
        const enrichedItems = await mapLimit(limitedItems, 3, (item) =>
          enrichLegislationItem(context, item)
        );

        meeting.items = [...enrichedItems, ...items.slice(limit)];
        mergeDiscoveredAgendaItemAttachments(
          meeting,
          enrichedItems.map((item) => ({
            agendaNumber: item.agendaNumber,
            title: item.title,
            rowText: item.rowText,
            sourceUrl: item.sourceUrl,
            attachments: (item.attachments || []).map((attachment) => ({
              label: attachment.label,
              url: attachment.url,
              type: attachment.type
            }))
          }))
        );
        if (enrichedItems.length > 0) {
          meeting.detailText = cleanText(
            [
              meeting.detailText,
              "Enriched Legislation Details:",
              formatLegistarItems(enrichedItems)
            ]
              .filter(Boolean)
              .join("\n\n")
          );
        }

        return meeting;
      });
    }

    if (options.downloadDocuments) {
      log("Downloading Legistar documents where available...");
      if ((options.monthsBack ?? 1) > 1) {
        log("Deep Legistar refresh: skipping packets and item attachments.");
      }
      await downloadLegistarDocuments(context, meetings, {
        log,
        outputDir: options.documentOutputDir,
        shouldStop: options.shouldStop,
        monthsBack: options.monthsBack
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
