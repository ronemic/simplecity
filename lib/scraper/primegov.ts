import { chromium, type BrowserContext, type Page } from "playwright";
import type { PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import {
  mergeDiscoveredAgendaItemAttachments,
  type DiscoveredAgendaItemAttachments
} from "@/lib/scraper/itemAttachments";
import { cleanText, slugify } from "@/lib/utils/slug";
import { filterMeetingsToWindow } from "@/lib/utils/meetingWindow";

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
  monthsBack?: number;
  monthsForward?: number;
  allVisible?: boolean;
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

type PrimeGovAgendaAttachmentRow = {
  agendaNumber: string | null;
  title: string | null;
  rowText: string;
  itemDetailsUrl: string;
};

export type PrimeGovAttachmentIdentityInput = {
  itemDetailsUrl: string;
  previewUrl?: string | null;
  documentId?: string | null;
  attachmentId?: string | null;
};

export type PrimeGovAttachmentDownloadDescriptor = {
  origin: string;
  kind: "document" | "attachment";
  id: string;
};

export function normalizePrimeGovItemDetailsUrl(value: string, baseUrl: string) {
  try {
    const direct = new URL(value, baseUrl);
    if (/\/portal\/item$/i.test(direct.pathname) && direct.searchParams.get("meetingitemid")) {
      return direct.toString();
    }
    const sharedUrl = direct.searchParams.get("url") || direct.searchParams.get("u");
    if (!sharedUrl) return null;
    const decoded = new URL(decodeURIComponent(sharedUrl), baseUrl);
    return /\/portal\/item$/i.test(decoded.pathname) && decoded.searchParams.get("meetingitemid")
      ? decoded.toString()
      : null;
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<U>
) {
  const results = new Array<U>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }));
  return results;
}

async function extractPrimeGovAttachmentRows(page: Page): Promise<PrimeGovAgendaAttachmentRow[]> {
  await page.evaluate("globalThis.__name = (value) => value");
  const rows = await page.evaluate(() => {
    const clean = (value = "") => value.replace(/\s+/g, " ").trim();
    const itemRows = Array.from(document.querySelectorAll('[title="Has Attachments"]'))
      .map((marker) => marker.closest("tr"))
      .filter((row): row is HTMLTableRowElement => Boolean(row));
    return Array.from(new Set(itemRows))
      .flatMap((row) => {
        const cells = Array.from(row.querySelectorAll(":scope > td"));
        const number = cells.map((cell) => clean((cell as HTMLElement).innerText || ""))
          .find((value) => /^\d+(?:\.\d+)+\.?$/.test(value)) || null;
        const numberIndex = cells.findIndex((cell) => clean((cell as HTMLElement).innerText || "") === number);
        const titleCell = numberIndex >= 0 ? cells[numberIndex + 1] : null;
        const title = clean((titleCell as HTMLElement | null)?.innerText || "") || null;
        const hrefs = Array.from(row.querySelectorAll("a[href]"))
          .map((anchor) => (anchor as HTMLAnchorElement).href);
        return [{
          agendaNumber: number?.replace(/\.$/, "") || null,
          title,
          rowText: clean(row.innerText || ""),
          hrefs
        }];
      });
  });

  const seenItemUrls = new Set<string>();
  return rows.flatMap((row) => {
    const itemDetailsUrl = row.hrefs
      .map((href) => normalizePrimeGovItemDetailsUrl(href, page.url()))
      .find(Boolean);
    if (!itemDetailsUrl || seenItemUrls.has(itemDetailsUrl)) return [];
    seenItemUrls.add(itemDetailsUrl);
    return [{ ...row, itemDetailsUrl }];
  });
}

function normalizedPrimeGovPreviewUrl(value?: string | null) {
  if (!value) return null;

  try {
    const source = new URL(value);
    if (!/^https?:$/i.test(source.protocol) || !/\/viewer\/preview$/i.test(source.pathname)) {
      return null;
    }

    const id = source.searchParams.get("id");
    const uid = source.searchParams.get("uid");
    const type = source.searchParams.get("type");
    if (!id || !type || !["0", "2"].includes(type) || (type === "2" && !uid)) return null;

    source.search = "";
    source.hash = "";
    source.searchParams.set("id", id);
    if (uid) source.searchParams.set("uid", uid);
    source.searchParams.set("type", type);
    return source.toString();
  } catch {
    return null;
  }
}

export function buildPrimeGovAttachmentIdentityUrl(
  input: PrimeGovAttachmentIdentityInput
) {
  try {
    const itemUrl = new URL(input.itemDetailsUrl);
    if (!/^https?:$/i.test(itemUrl.protocol)) return null;

    const previewUrl = normalizedPrimeGovPreviewUrl(input.previewUrl);
    if (previewUrl && new URL(previewUrl).origin === itemUrl.origin) return previewUrl;

    const kind = input.documentId ? "document" : input.attachmentId ? "attachment" : null;
    const id = input.documentId || input.attachmentId;
    if (!kind || !id) return null;
    itemUrl.hash = new URLSearchParams({ [`primegov-${kind}`]: id }).toString();
    return itemUrl.toString();
  } catch {
    return null;
  }
}

export function primeGovAttachmentDownloadDescriptor(
  sourceUrl: string
): PrimeGovAttachmentDownloadDescriptor | null {
  try {
    const source = new URL(sourceUrl);
    if (!/^https?:$/i.test(source.protocol)) return null;

    if (/\/viewer\/preview$/i.test(source.pathname)) {
      const type = source.searchParams.get("type");
      const id = type === "2"
        ? source.searchParams.get("uid")
        : type === "0"
          ? source.searchParams.get("id")
          : null;
      if (!id) return null;
      return {
        origin: source.origin,
        kind: type === "2" ? "attachment" : "document",
        id
      };
    }

    const hash = new URLSearchParams(source.hash.replace(/^#/, ""));
    const documentId = hash.get("primegov-document");
    const attachmentId = hash.get("primegov-attachment");
    if (!documentId && !attachmentId) return null;
    return {
      origin: source.origin,
      kind: documentId ? "document" : "attachment",
      id: documentId || attachmentId || ""
    };
  } catch {
    return null;
  }
}

async function resolvePrimeGovAttachmentUrl(
  context: BrowserContext,
  origin: string,
  kind: "document" | "attachment",
  id: string
) {
  const path = kind === "document"
    ? `/api/systemdocument/GetPublicPdfDownloadUrl/${encodeURIComponent(id)}`
    : `/api/systemitemattachment/GetPublicPdfDownloadUrlV1/${encodeURIComponent(id)}`;
  const response = await context.request.get(new URL(path, origin).toString(), { timeout: 60_000 });
  if (!response.ok()) return null;
  const value = await response.json().catch(() => null) as unknown;
  return typeof value === "string" && /^https?:/i.test(value) ? value : null;
}

export async function resolvePrimeGovAttachmentDownloadUrl(
  context: BrowserContext,
  sourceUrl: string
) {
  const descriptor = primeGovAttachmentDownloadDescriptor(sourceUrl);
  if (!descriptor) return sourceUrl;
  return resolvePrimeGovAttachmentUrl(
    context,
    descriptor.origin,
    descriptor.kind,
    descriptor.id
  );
}

async function scrapePrimeGovItemAttachments(
  context: BrowserContext,
  row: PrimeGovAgendaAttachmentRow
): Promise<DiscoveredAgendaItemAttachments> {
  const page = await context.newPage();
  try {
    await page.goto(row.itemDetailsUrl, { waitUntil: "networkidle", timeout: 60_000 });
    const heading = page.locator("#AttachmentsHeading");
    if ((await heading.count()) === 1) {
      await heading.click();
      await page.waitForTimeout(250);
    }
    await page.evaluate("globalThis.__name = (value) => value");
    const candidates = await page.evaluate(() => Array.from(document.querySelectorAll("#AttachmentsTable tbody tr"))
      .flatMap((attachmentRow) => {
        const label = (attachmentRow.querySelector("td")?.textContent || "").replace(/\s+/g, " ").trim();
        const hrefs = Array.from(attachmentRow.querySelectorAll("a[href]"))
          .map((anchor) => anchor.getAttribute("href") || "");
        const documentId = hrefs.map((href) => href.match(/downloadAttachedDocumentAsPdf\((\d+)\)/)?.[1]).find(Boolean);
        const attachmentId = hrefs.map((href) => href.match(/downloadAttachmentAsPdf\(['\"]([^'\"]+)['\"]\)/)?.[1]).find(Boolean);
        const previewUrl = Array.from(attachmentRow.querySelectorAll("a[href]"))
          .map((anchor) => (anchor as HTMLAnchorElement).href)
          .find((href) => /\/viewer\/preview/i.test(href));
        return label && (documentId || attachmentId || previewUrl)
          ? [{ label, documentId: documentId || null, attachmentId: attachmentId || null, previewUrl: previewUrl || null }]
          : [];
      }));
    const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [
      candidate.documentId || candidate.attachmentId || candidate.previewUrl,
      candidate
    ])).values());
    const attachments = uniqueCandidates.map((candidate) => {
      const url = buildPrimeGovAttachmentIdentityUrl({
        itemDetailsUrl: row.itemDetailsUrl,
        previewUrl: candidate.previewUrl,
        documentId: candidate.documentId,
        attachmentId: candidate.attachmentId
      });
      return url ? { label: candidate.label, url } : null;
    }).filter((attachment): attachment is { label: string; url: string } => Boolean(attachment));
    return { ...row, sourceUrl: row.itemDetailsUrl, attachments };
  } finally {
    await page.close();
  }
}

export async function discoverPrimeGovAgendaAttachments(
  context: BrowserContext,
  meeting: PrimeGovMeeting,
  options: { log?: (message: string) => void; shouldStop?: () => boolean } = {}
) {
  const htmlAgenda = meeting.documents.find((document) => document.type === "HTML Agenda");
  if (!htmlAgenda) return { attachmentsAdded: 0, itemsWithAttachments: 0 };
  const page = await context.newPage();
  try {
    await page.goto(htmlAgenda.url, { waitUntil: "networkidle", timeout: 60_000 });
    const rows = await extractPrimeGovAttachmentRows(page);
    const discoveries = (await mapWithConcurrency(rows, 4, async (row) => {
      if (options.shouldStop?.()) return null;
      try {
        return await scrapePrimeGovItemAttachments(context, row);
      } catch (error) {
        options.log?.(`PrimeGov item attachment discovery failed for ${row.itemDetailsUrl}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    })).filter((discovery): discovery is DiscoveredAgendaItemAttachments => Boolean(discovery));
    return mergeDiscoveredAgendaItemAttachments(meeting, discoveries);
  } finally {
    await page.close();
  }
}

async function extractPaginatedPortalMeetings(page: Page) {
  const pageSize = page.locator('select[name="archivedMeetingsTable_length"]');
  if (await pageSize.count()) {
    await pageSize.selectOption("15").catch(() => undefined);
    await page.waitForTimeout(500);
  }

  const meetings: PrimeGovMeeting[] = [];
  for (let pageNumber = 0; pageNumber < 12; pageNumber += 1) {
    meetings.push(...await extractVisibleMeetings(page));
    const next = page.locator('a[aria-controls="archivedMeetingsTable"]', { hasText: /^Next$/ });
    if ((await next.count()) !== 1) break;
    const disabled = await next.evaluate((element) =>
      element.parentElement?.classList.contains("disabled") ||
      element.getAttribute("aria-disabled") === "true"
    );
    if (disabled) break;
    const firstArchivedRow = await page
      .locator("#archivedMeetingsTable tbody tr")
      .first()
      .innerText()
      .catch(() => "");
    await next.click();
    await page.waitForFunction(
      (previous) =>
        (document.querySelector("#archivedMeetingsTable tbody tr")?.textContent || "").trim() !== previous.trim(),
      firstArchivedRow,
      { timeout: 10_000 }
    ).catch(() => page.waitForTimeout(500));
  }
  return dedupeMeetings(meetings);
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
    const visibleMeetings = await extractPaginatedPortalMeetings(page);

    const currentMeetings = visibleMeetings.filter(
      (meeting) => meeting.section === "Current And Upcoming Meetings"
    );

    const archivedMeetings = visibleMeetings.filter(
      (meeting) => meeting.section === "Archived Meetings"
    );

    log(`Found ${currentMeetings.length} current/upcoming meetings.`);
    log(`Found ${archivedMeetings.length} archived meetings.`);

    let meetings = dedupeMeetings([...currentMeetings, ...archivedMeetings]);
    if (!options.allVisible && !options.allYears) {
      meetings = filterMeetingsToWindow(meetings, options);
      log(
        `PrimeGov meetings in configured window (${options.monthsBack ?? 1} month(s) back, ${options.monthsForward ?? 1} month(s) forward): ${meetings.length}.`
      );
    }
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

    if (options.enrichAgendaAttachments ?? true) {
      log("Discovering PrimeGov item attachments...");
      for (const meeting of meetings) {
        if (options.shouldStop?.()) break;
        if (!meeting.hasHtmlAgenda) continue;
        const result = await discoverPrimeGovAgendaAttachments(context, meeting, {
          log,
          shouldStop: options.shouldStop
        });
        if (result.attachmentsAdded > 0) {
          log(`Discovered ${result.attachmentsAdded} PrimeGov attachment(s) for ${meeting.title}.`);
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
  let documentId = primeGovAttachmentDownloadDescriptor(sourceUrl)?.id || getMeetingTemplateId(sourceUrl);
  if (!documentId) {
    try {
      const parsed = new URL(sourceUrl);
      documentId =
        parsed.searchParams.get("uid") ||
        parsed.searchParams.get("id") ||
        parsed.searchParams.get("documentId") ||
        slugify(parsed.pathname.split("/").filter(Boolean).slice(-5).join("-")) ||
        "unknown-id";
    } catch {
      documentId = slugify(sourceUrl.slice(-80)) || "unknown-id";
    }
  }

  return [
    meeting.section === "Archived Meetings" ? "archived" : "upcoming",
    meeting.dateText ? slugify(meeting.dateText) : "no-date",
    slugify(meeting.title || "untitled-meeting"),
    slugify(docType),
    documentId
  ]
    .filter(Boolean)
    .join("__");
}
