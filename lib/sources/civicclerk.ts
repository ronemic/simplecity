import { chromium, type Page } from "playwright";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type {
  AgendaItem,
  DocumentType,
  MeetingStatus,
  PrimeGovDocument,
  PrimeGovMeeting,
  ScrapePortalResult
} from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { downloadOfficialSiteDocuments } from "@/lib/scraper/downloadDocuments";
import { parseMeetingDate } from "@/lib/utils/date";
import { isMeetingDateInWindow } from "@/lib/utils/meetingWindow";
import { getVideoEmbedUrl } from "@/lib/utils/videoEmbed";
import { cleanText, slugify } from "@/lib/utils/slug";

const DEFAULT_MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const DEFAULT_DOCUMENT_TIMEOUT_MS = 60_000;

export type CivicClerkEventCard = {
  eventId: string;
  eventUrl: string;
  title: string;
  bodyName: string | null;
  dateText: string | null;
  timeText: string | null;
  location: string | null;
  agendaPostedText: string | null;
  description: string | null;
  rowText: string;
};

type CivicClerkFileEntry = {
  label: string;
  fileId: string | null;
  url: string | null;
};

type CivicClerkItemEntry = {
  heading: string;
  files: CivicClerkFileEntry[];
};

type CivicClerkFilesPage = {
  heading: string | null;
  files: CivicClerkFileEntry[];
  items: CivicClerkItemEntry[];
};

type CivicClerkMediaPage = {
  hasNoVideoMessage: boolean;
  iframeUrls: Array<{ label: string; url: string }>;
  linkUrls: Array<{ label: string; url: string }>;
};

export type ScrapeCivicClerkOptions = ScrapePortalOptions & {
  jurisdiction: JurisdictionConfig;
  limit?: number;
  monthsBack?: number;
  monthsForward?: number;
  allVisible?: boolean;
  body?: string;
};

function normalizedPortalUrl(value: string) {
  const url = new URL(value);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function buildCivicClerkFileUrl(portalUrl: string, fileId: string) {
  const portal = new URL(portalUrl);
  const apiHost = portal.hostname.replace(".portal.", ".api.");
  if (apiHost === portal.hostname) {
    throw new Error(`Unable to derive CivicClerk API host from ${portal.hostname}.`);
  }

  return `${portal.protocol}//${apiHost}/v1/Meetings/GetMeetingFileStream(fileId=${encodeURIComponent(fileId)},plainText=false)`;
}

export function civicClerkPlainTextFileUrl(fileUrl: string) {
  try {
    const url = new URL(fileUrl);
    if (!url.pathname.includes("/Meetings/GetMeetingFileStream")) return null;
    if (/plainText=false/i.test(fileUrl)) {
      return fileUrl.replace(/plainText=false/i, "plainText=true");
    }
    return fileUrl.replace(/\)$/, ",plainText=true)");
  } catch {
    return null;
  }
}

export function civicClerkFileIdFromControlId(value?: string | null) {
  return value?.match(/-(\d+)$/)?.[1] || null;
}

export function classifyCivicClerkFile(
  label = "",
  contextText = "",
  url = ""
): DocumentType {
  const text = cleanText(`${label} ${contextText}`).toLowerCase();
  const href = url.toLowerCase();

  if (text.includes("cancellation") || text.includes("cancelled") || text.includes("canceled")) {
    return "Notice of Cancellation";
  }
  if (text.includes("agenda packet")) return "Agenda Packet";
  if (text === "agenda" || text.startsWith("agenda ") || text.includes(" agenda")) return "Agenda";
  if (text.includes("minutes")) return "Minutes";
  if (text.includes("staff report")) return "Staff Report";
  if (text.includes("attachment")) return "Attachment";
  if (text.includes("resolution")) return "Resolution";
  if (text.includes("ordinance")) return "Ordinance";
  if (text.includes("contract") || text.includes("agreement")) return "Contract";
  if (text.includes("exhibit")) return "Exhibit";
  if (text.includes("public comment")) return "Public Comment";
  if (
    text.includes("video") ||
    text.includes("media") ||
    href.includes("youtube.com") ||
    href.includes("youtu.be")
  ) {
    return "Media";
  }
  return "Other";
}

function inferBodyName(title: string) {
  const inferred = cleanText(
    title
      .replace(/\b(?:regular|special|adjourned|closed\s+session)\b/gi, " ")
      .replace(/\bmeeting\b/gi, " ")
  );
  return inferred || title;
}

function meetingStatus(dateText: string | null, timeText: string | null, rowText: string, now: number) {
  if (/\bcancell?ed\b|\bcancellation\b/i.test(rowText)) return "Cancelled" as const;
  const parsed = parseMeetingDate([dateText, timeText].filter(Boolean).join(" "));
  if (!parsed) return "Unknown" as const;
  return new Date(parsed).getTime() >= now ? "Upcoming" as const : "Past" as const;
}

function sectionForStatus(status: MeetingStatus) {
  return status === "Upcoming" ? "Upcoming Meetings" as const : "Past Meetings" as const;
}

export function normalizeCivicClerkEventCards(
  cards: CivicClerkEventCard[],
  jurisdiction: JurisdictionConfig,
  now = Date.now()
): PrimeGovMeeting[] {
  const seen = new Set<string>();
  const meetings: PrimeGovMeeting[] = [];

  for (const card of cards) {
    if (!card.eventId || seen.has(card.eventId)) continue;
    seen.add(card.eventId);

    const bodyName = cleanText(card.bodyName || "") || inferBodyName(card.title);
    const status = meetingStatus(card.dateText, card.timeText, card.rowText, now);
    const filesUrl = new URL(`/event/${encodeURIComponent(card.eventId)}/files`, jurisdiction.sourceUrl).toString();

    meetings.push({
      externalId: `${jurisdiction.slug}-civicclerk-event-${card.eventId}`,
      jurisdictionName: jurisdiction.name,
      jurisdictionSlug: jurisdiction.slug,
      platform: jurisdiction.platform,
      section: sectionForStatus(status),
      title: card.title,
      dateText: card.dateText,
      timeText: card.timeText,
      meetingType: bodyName,
      bodyName,
      location: card.location,
      rowText: card.rowText,
      status,
      sourceType: "CivicClerk",
      sourceUrl: filesUrl,
      source: normalizedPortalUrl(jurisdiction.sourceUrl),
      sectionUrl: normalizedPortalUrl(jurisdiction.sourceUrl),
      meetingDetailsUrl: filesUrl,
      hasHtmlAgenda: false,
      hasPdf: false,
      documents: [],
      items: [],
      extractionNotes: card.agendaPostedText
        ? [`Agenda posted: ${card.agendaPostedText}`]
        : []
    });
  }

  return meetings;
}

async function waitForEventList(page: Page, portalUrl: string) {
  await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('[aria-label="Events by date"] a[role="button"][data-id]', {
    timeout: 60_000
  });
}

async function loadMoreEvents(page: Page, direction: "previous" | "upcoming", attempts: number) {
  const name = direction === "previous" ? /Load more previous events/i : /Load more upcoming events/i;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const button = page.getByRole("button", { name });
    if ((await button.count()) !== 1 || !(await button.isEnabled())) return;
    const before = await page.locator('[aria-label="Events by date"] a[role="button"][data-id]').count();
    await button.click();
    const expanded = await page
      .waitForFunction(
        (count) => document.querySelectorAll('[aria-label="Events by date"] a[role="button"][data-id]').length > count,
        before,
        { timeout: 15_000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!expanded) return;
  }
}

async function extractEventCards(page: Page): Promise<CivicClerkEventCard[]> {
  return page.evaluate<CivicClerkEventCard[]>(String.raw`(() => {
    const compact = (value = "") => value.replace(/\s+/g, " ").trim();
    const list = document.querySelector('[aria-label="Events by date"]');
    if (!list) return [];

    return Array.from(list.querySelectorAll('a[role="button"][data-id]')).map((anchor) => {
      const eventId = anchor.dataset.id || anchor.id || "";
      const metadata = anchor.querySelector('[aria-label*=" event on "]');
      const metadataLabel = metadata?.getAttribute("aria-label") || "";
      const bodyName = metadataLabel.match(/^(.*?)\s+event on\s+/i)?.[1] || null;
      const agendaPostedText = metadataLabel.match(/Agenda Posted on,\s*(.+)$/i)?.[1] || null;
      const paragraphs = Array.from(anchor.querySelectorAll("p")).map((node) => compact(node.textContent || ""));
      const timeText = paragraphs.find((text) => /\b\d{1,2}:\d{2}\s*[AP]M\b/i.test(text)) || null;
      const location = compact(
        anchor.querySelector('[aria-label="Event Location"]')?.textContent || ""
      ) || null;
      const description = paragraphs.find((text) => text !== timeText && text !== location) || null;

      return {
        eventId,
        eventUrl: anchor.href,
        title: compact(anchor.querySelector("h3")?.textContent || ""),
        bodyName: bodyName ? compact(bodyName) : null,
        dateText: compact(anchor.querySelector("h2")?.textContent || "") || null,
        timeText,
        location,
        agendaPostedText: agendaPostedText ? compact(agendaPostedText) : null,
        description,
        rowText: compact(anchor.innerText || anchor.textContent || "")
      };
    });
  })()`);
}

async function extractFilesPage(page: Page): Promise<CivicClerkFilesPage> {
  return page.evaluate<CivicClerkFilesPage>(String.raw`(() => {
    const compact = (value = "") => value.replace(/\s+/g, " ").trim();
    const fileEntry = (container) => {
      const download = container.querySelector('button[id^="download"]');
      const controlId = download?.id || "";
      const fileId = controlId.match(/-(\d+)$/)?.[1] || null;
      const directLink = container.querySelector('a[href*="GetMeetingFileStream"]');
      const mainButton = Array.from(container.querySelectorAll("button")).find(
        (button) => !String(button.getAttribute("aria-label") || "").toLowerCase().startsWith("download ")
      );
      const label = compact(
        mainButton?.textContent ||
          download?.getAttribute("aria-label")?.replace(/^Download\s+/i, "") ||
          container.textContent ||
          ""
      );
      if (!label || (!fileId && !directLink?.href)) return null;
      return { label, fileId, url: directLink?.href || null };
    };

    const files = document.querySelector("#files");
    const topFiles = files
      ? Array.from(files.children)
          .filter((child) => child.tagName === "LI")
          .map(fileEntry)
          .filter(Boolean)
      : [];

    const attachments = document.querySelector("#AttachmentsList");
    const items = [];
    let current = null;
    if (attachments) {
      for (const child of Array.from(attachments.children)) {
        const isHeader =
          child.id.includes("listSubheader") ||
          String(child.getAttribute("class") || "").includes("MuiListSubheader-root");
        if (isHeader) {
          const heading = compact(child.textContent || "");
          if (heading) {
            current = { heading, files: [] };
            items.push(current);
          }
          continue;
        }

        if (child.tagName !== "LI" || !current) continue;
        const entry = fileEntry(child);
        if (entry) current.files.push(entry);
      }
    }

    return {
      heading: compact(document.querySelector("header h2, [role=banner] h2")?.textContent || "") || null,
      files: topFiles,
      items
    };
  })()`);
}

function documentFromFile(
  file: CivicClerkFileEntry,
  portalUrl: string,
  sourceUrl: string,
  item?: { number: string | null; title: string }
): PrimeGovDocument | null {
  const url = file.url || (file.fileId ? buildCivicClerkFileUrl(portalUrl, file.fileId) : null);
  if (!url) return null;
  return {
    type: classifyCivicClerkFile(file.label, item?.title || "", url),
    label: file.label,
    url,
    parentDocumentUrl: sourceUrl,
    agendaItemNumber: item?.number || null,
    agendaItemTitle: item?.title || null,
    isAgendaItemAttachment: Boolean(item)
  };
}

function itemIdentity(heading: string, index: number) {
  const match = cleanText(heading).match(/^([\w.-]+)\.\s*(.+)$/);
  return {
    number: match?.[1] || String(index + 1),
    title: match?.[2] || cleanText(heading)
  };
}

function normalizeFilesPage(
  meeting: PrimeGovMeeting,
  page: CivicClerkFilesPage,
  portalUrl: string,
  sourceUrl: string
) {
  const documents = page.files.flatMap((file) => {
    const document = documentFromFile(file, portalUrl, sourceUrl);
    return document ? [document] : [];
  });
  const items: AgendaItem[] = page.items.map((item, index) => {
    const identity = itemIdentity(item.heading, index);
    const attachments = item.files.flatMap((file) => {
      const document = documentFromFile(file, portalUrl, sourceUrl, identity);
      return document ? [document] : [];
    });
    documents.push(...attachments);
    return {
      externalId: `${meeting.externalId}-item-${slugify(identity.number || identity.title)}`,
      fileNumber: null,
      agendaNumber: identity.number,
      itemType: null,
      title: identity.title,
      action: null,
      result: null,
      sourceUrl,
      rowText: cleanText([item.heading, ...item.files.map((file) => file.label)].join(" ")),
      attachments
    };
  });

  const seen = new Set<string>();
  meeting.documents = documents.filter((document) => {
    const key = [
      document.type,
      document.url.toLowerCase(),
      document.agendaItemNumber || "",
      document.agendaItemTitle || ""
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  meeting.items = items;
  meeting.hasPdf = meeting.documents.length > 0;
  meeting.detailText = items
    .map((item) => [
      `Agenda item ${item.agendaNumber || "Unnumbered"}: ${item.title || "Not listed in the source document."}`,
      ...(item.attachments || []).map((document) => `${document.label}: ${document.url}`)
    ].join("\n"))
    .join("\n\n");
}

async function extractMediaPage(page: Page): Promise<CivicClerkMediaPage> {
  return page.evaluate<CivicClerkMediaPage>(String.raw`(() => {
    const compact = (value = "") => value.replace(/\s+/g, " ").trim();
    const panel = document.querySelector('[role="tabpanel"]') || document.body;
    return {
      hasNoVideoMessage: /there is no video for this event/i.test(compact(panel.textContent || "")),
      iframeUrls: Array.from(panel.querySelectorAll("iframe[src]"))
        .map((frame) => ({ label: frame.title || "Meeting recording", url: frame.src }))
        .filter((entry) => Boolean(entry.url)),
      linkUrls: Array.from(panel.querySelectorAll("a[href]"))
        .map((anchor) => ({ label: compact(anchor.textContent || "") || "Meeting recording", url: anchor.href }))
        .filter((entry) => Boolean(entry.url))
    };
  })()`);
}

function addMediaDocuments(meeting: PrimeGovMeeting, media: CivicClerkMediaPage, mediaUrl: string) {
  const candidates = [...media.iframeUrls, ...media.linkUrls].filter((entry) =>
    Boolean(getVideoEmbedUrl(entry.url))
  );
  if (media.hasNoVideoMessage || candidates.length === 0) return 0;

  meeting.documents.push({
    type: "Media",
    label: "CivicClerk Meeting Media",
    url: mediaUrl,
    parentDocumentUrl: meeting.meetingDetailsUrl || meeting.sourceUrl || null
  });
  for (const candidate of candidates) {
    meeting.documents.push({
      type: "Video",
      label: candidate.label || "Meeting recording",
      url: candidate.url,
      parentDocumentUrl: mediaUrl
    });
  }
  return candidates.length;
}

function isOfficialCivicClerkUrl(value: string, portalUrl: string) {
  try {
    const url = new URL(value);
    const portal = new URL(portalUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === portal.hostname ||
        url.hostname === portal.hostname.replace(".portal.", ".api."))
    );
  } catch {
    return false;
  }
}

export async function scrapeCivicClerkMeetings(
  options: ScrapeCivicClerkOptions
): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const jurisdiction = options.jurisdiction;
  const portalUrl = normalizedPortalUrl(
    options.portalUrl || jurisdiction.civicClerkUrl || jurisdiction.sourceUrl
  );
  const monthsBack = Math.max(0, options.monthsBack ?? 1);
  const monthsForward = Math.max(0, options.monthsForward ?? 1);
  const browser = await chromium.launch({ headless: !options.headful });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 SimpleCity CivicClerk agenda scraper",
    viewport: { width: 1600, height: 1200 }
  });
  const page = await context.newPage();

  try {
    log(`Starting CivicClerk scraper for ${jurisdiction.slug}.`);
    log(`CivicClerk source URL: ${portalUrl}`);
    log(`CivicClerk target region: ${jurisdiction.regionSlug}.`);
    await waitForEventList(page, portalUrl);
    await loadMoreEvents(page, "previous", options.allVisible ? 3 : monthsBack);
    await loadMoreEvents(page, "upcoming", options.allVisible ? 3 : monthsForward);

    let cards = await extractEventCards(page);
    log(`CivicClerk event cards found: ${cards.length}.`);
    if (!options.allVisible) {
      cards = cards.filter((card) =>
        isMeetingDateInWindow(card.dateText, card.timeText, { monthsBack, monthsForward })
      );
    }
    if (options.body) {
      const requestedBody = slugify(options.body);
      cards = cards.filter(
        (card) => slugify(card.bodyName || "") === requestedBody || slugify(card.title).includes(requestedBody)
      );
    }

    let meetings = normalizeCivicClerkEventCards(cards, jurisdiction);
    log(`CivicClerk valid meetings in configured window: ${meetings.length}.`);
    if (options.limit) meetings = meetings.slice(0, options.limit);
    log(`CivicClerk unique events after deduplication: ${meetings.length}.`);
    if (meetings.length === 0) {
      throw new Error("CivicClerk scraper found zero valid meetings in the configured window.");
    }

    let filesPagesVisited = 0;
    let recordingsFound = 0;
    let itemCount = 0;
    for (const meeting of meetings) {
      if (options.shouldStop?.()) break;
      const eventId = meeting.externalId?.match(/event-(\d+)$/)?.[1];
      if (!eventId) {
        meeting.extractionNotes = [...(meeting.extractionNotes || []), "CivicClerk event ID was missing."];
        continue;
      }
      const filesUrl = new URL(`/event/${eventId}/files`, portalUrl).toString();
      const mediaUrl = new URL(`/event/${eventId}/media`, portalUrl).toString();

      try {
        await page.goto(filesUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForSelector('[aria-label="Meeting Files List"], [role="tabpanel"]', {
          timeout: 30_000
        });
        // CivicClerk renders the attachment groups after the top-level file list.
        await page.waitForTimeout(1_200);
        const filesPage = await extractFilesPage(page);
        normalizeFilesPage(meeting, filesPage, portalUrl, filesUrl);
        filesPagesVisited += 1;
        itemCount += meeting.items?.length || 0;
        log(`${meeting.title}: ${meeting.documents.length} document(s), ${meeting.items?.length || 0} item(s).`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown CivicClerk files-page error";
        meeting.extractionNotes = [...(meeting.extractionNotes || []), `Files page failed: ${message}`];
        log(`${meeting.title}: files page failed: ${message}`);
      }

      try {
        await page.goto(mediaUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForSelector('[role="tabpanel"]', { timeout: 15_000 });
        await page.waitForTimeout(500);
        recordingsFound += addMediaDocuments(meeting, await extractMediaPage(page), mediaUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown CivicClerk media-page error";
        meeting.extractionNotes = [...(meeting.extractionNotes || []), `Media page failed: ${message}`];
        log(`${meeting.title}: media page failed: ${message}`);
      }
    }

    const documentCount = meetings.reduce((sum, meeting) => sum + meeting.documents.length, 0);
    log(`CivicClerk files pages visited: ${filesPagesVisited}.`);
    log(`CivicClerk documents found: ${documentCount}.`);
    log(`CivicClerk items extracted: ${itemCount}.`);
    log(`CivicClerk recordings found: ${recordingsFound}.`);

    if (options.downloadDocuments) {
      log("Downloading CivicClerk documents with the shared official-document downloader.");
      const result = await downloadOfficialSiteDocuments(context, meetings, {
        outputDir: options.documentOutputDir,
        log,
        shouldStop: options.shouldStop,
        maxBytes: DEFAULT_MAX_DOCUMENT_BYTES,
        timeoutMs: DEFAULT_DOCUMENT_TIMEOUT_MS,
        documentFilter: (document) =>
          isOfficialCivicClerkUrl(document.url, portalUrl) &&
          document.url.includes("/Meetings/GetMeetingFileStream"),
        validateFinalUrl: (url) => isOfficialCivicClerkUrl(url, portalUrl),
        userAgent: "Mozilla/5.0 SimpleCity CivicClerk agenda scraper",
        plainTextFallbackUrl: civicClerkPlainTextFileUrl
      });
      log(`CivicClerk document downloads complete: ${result.downloaded} downloaded, ${result.failed} failed.`);
    }

    log(`CivicClerk scraper completed for ${jurisdiction.slug}.`);
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
