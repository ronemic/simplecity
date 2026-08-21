import { chromium, type BrowserContext, type Page } from "playwright";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type {
  AgendaItem,
  DocumentType,
  PrimeGovDocument,
  PrimeGovMeeting,
  ScrapePortalResult
} from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import {
  downloadOfficialSiteDocuments
} from "@/lib/scraper/downloadDocuments";
import {
  isUsablePrimeGovHtmlAgendaText,
  normalizePrimeGovHtmlAgendaText
} from "@/lib/scraper/primegov";
import { isMeetingDateInWindow } from "@/lib/utils/meetingWindow";
import { parseMeetingDate } from "@/lib/utils/date";
import { cleanText, slugify } from "@/lib/utils/slug";

const ESCRIBE_USER_AGENT = "Mozilla/5.0 SimpleCity eSCRIBE agenda scraper";

export type EscribeMeetingLink = {
  Title?: string | null;
  Type?: string | null;
  Format?: string | null;
  Url?: string | null;
};

export type EscribeMeetingRecord = {
  Id: string;
  MeetingType: string;
  LocationName?: string | null;
  FormattedStart?: string | null;
  DateLong?: string | null;
  MeetingDate?: string | null;
  MeetingTime?: string | null;
  Cancelled?: boolean;
  MeetingLinks?: EscribeMeetingLink[];
  section: "Upcoming Meetings" | "Past Meetings";
};

type EscribePastMeetingsResponse = {
  d?: {
    Meetings?: Omit<EscribeMeetingRecord, "section">[];
    TotalCount?: number;
  };
};

export type ScrapeEscribeOptions = ScrapePortalOptions & {
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

function absoluteEscribeUrl(value: string, portalUrl: string) {
  return new URL(value, portalUrl).toString();
}

export function classifyEscribeDocument(
  link: Pick<EscribeMeetingLink, "Title" | "Type" | "Format" | "Url">
): DocumentType {
  const label = cleanText(link.Title || "").toLowerCase();
  const sourceType = cleanText(link.Type || "").toLowerCase();
  const format = cleanText(link.Format || "").toLowerCase();

  if (format === "html" && label.includes("agenda")) return "HTML Agenda";
  if (label.includes("cancel")) return "Notice of Cancellation";
  if (label.includes("public comment")) return "Public Comments";
  if (label.includes("minute") || sourceType.includes("minute")) return "Minutes";
  if (label.includes("full package") || label.includes("packet")) return "Agenda Packet";
  if (label.includes("staff report")) return "Staff Report";
  if (label.includes("resolution")) return "Resolution";
  if (label.includes("ordinance")) return "Ordinance";
  if (label.includes("contract") || label.includes("agreement")) return "Contract";
  if (label.includes("exhibit")) return "Exhibit";
  if (sourceType === "additionaldocuments") return "Attachment";
  if (label.includes("agenda") || sourceType === "agendacover") return "Agenda";
  if (format === "video" || sourceType === "video") return "Video";
  return "Document";
}

function normalizeLinks(
  links: EscribeMeetingLink[] = [],
  portalUrl: string
): PrimeGovDocument[] {
  const documents: PrimeGovDocument[] = [];
  const seen = new Set<string>();

  for (const link of links) {
    if (!link.Url) continue;
    const url = absoluteEscribeUrl(link.Url, portalUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    const type = classifyEscribeDocument(link);
    documents.push({
      type,
      label: cleanText(link.Title || type),
      url
    });
  }

  return documents;
}

export function normalizeEscribeMeetingRecords(
  records: EscribeMeetingRecord[],
  jurisdiction: JurisdictionConfig,
  portalUrl = jurisdiction.escribeUrl || jurisdiction.sourceUrl
): PrimeGovMeeting[] {
  const byId = new Map<string, PrimeGovMeeting>();

  for (const record of records) {
    if (!record.Id || !record.MeetingType) continue;
    const documents = normalizeLinks(record.MeetingLinks, portalUrl);
    const title = cleanText(record.MeetingType);
    const dateText = cleanText(
      record.DateLong || record.MeetingDate || record.FormattedStart || ""
    ) || null;
    const timeText = record.DateLong || record.MeetingDate
      ? cleanText(record.MeetingTime || "") || null
      : null;
    const cancelled = Boolean(record.Cancelled) || documents.some(
      (document) => document.type === "Notice of Cancellation"
    );
    const meetingUrl = new URL("Meeting.aspx", portalUrl);
    meetingUrl.searchParams.set("Id", record.Id);
    meetingUrl.searchParams.set("lang", "English");
    const rowText = cleanText([
      title,
      record.FormattedStart || dateText,
      record.LocationName,
      ...documents.map((document) => document.label)
    ].filter(Boolean).join(" "));

    const meeting: PrimeGovMeeting = {
      externalId: `${jurisdiction.slug}:escribe-meeting:${record.Id.toLowerCase()}`,
      jurisdictionName: jurisdiction.name,
      jurisdictionSlug: jurisdiction.slug,
      platform: "escribe",
      section: record.section,
      title,
      dateText,
      timeText,
      meetingType: title,
      bodyName: title,
      location: cleanText(record.LocationName || "") || null,
      rowText,
      status: cancelled
        ? "Cancelled"
        : record.section === "Upcoming Meetings"
          ? "Upcoming"
          : "Past",
      sourceType: "eSCRIBE",
      sourceUrl: meetingUrl.toString(),
      source: portalUrl,
      sectionUrl: portalUrl,
      meetingDetailsUrl: meetingUrl.toString(),
      hasHtmlAgenda: documents.some((document) => document.type === "HTML Agenda"),
      hasPdf: documents.some((document) => /\/FileStream\.ashx/i.test(document.url)),
      documents,
      items: [],
      extractionNotes: []
    };

    const existing = byId.get(record.Id.toLowerCase());
    if (!existing || existing.section === "Past Meetings") {
      byId.set(record.Id.toLowerCase(), meeting);
    }
  }

  return Array.from(byId.values()).sort((left, right) =>
    `${left.dateText || ""} ${left.timeText || ""}`.localeCompare(
      `${right.dateText || ""} ${right.timeText || ""}`
    )
  );
}

async function extractUpcomingRecords(page: Page): Promise<EscribeMeetingRecord[]> {
  return page.evaluate<EscribeMeetingRecord[]>(String.raw`(() => {
    const compact = (value = "") => value.replace(/\s+/g, " ").trim();
    const cards = Array.from(document.querySelectorAll(".upcoming-meeting-container"));
    return cards.map((card) => {
      const links = Array.from(card.querySelectorAll("a[href]"));
      const hrefs = links.map((link) => link.getAttribute("href") || "");
      const identityHref = hrefs.find((href) => /(?:Meeting\.aspx\?Id=|MeetingId=)[0-9a-f-]{36}/i.test(href)) || "";
      const id = identityHref.match(/(?:[?&]Id=|MeetingId=)([0-9a-f-]{36})/i)?.[1] || "";
      const meetingLinks = links
        .filter((link) => {
          const href = link.getAttribute("href") || "";
          const label = compact(link.getAttribute("title") || link.textContent || "");
          return (/FileStream\.ashx|ISIStandAlonePlayer\.aspx/i.test(href) ||
            (/Meeting\.aspx\?Id=/i.test(href) && /agenda/i.test(label))) &&
            !/PublicComment|DelegationRequest/i.test(href);
        })
        .map((link) => ({
          Title: compact(link.getAttribute("title") || link.textContent || "Document"),
          Type: link.getAttribute("href")?.includes("Meeting.aspx") ? "Agenda" : null,
          Format: link.getAttribute("href")?.includes("Meeting.aspx") ? "HTML" :
            link.getAttribute("href")?.includes("Player.aspx") ? "Video" : ".pdf",
          Url: link.getAttribute("href")
        }));
      return {
        Id: id,
        MeetingType: compact(card.querySelector(".meeting-title-heading")?.textContent || ""),
        LocationName: compact(card.querySelector(".startLocation")?.textContent || "") || null,
        FormattedStart: compact(card.querySelector(".meeting-date")?.textContent || "") || null,
        Cancelled: /cancel/i.test(compact(card.textContent || "")),
        MeetingLinks: meetingLinks,
        section: "Upcoming Meetings"
      };
    }).filter((record) => record.Id && record.MeetingType);
  })()`);
}

async function fetchPastRecords(page: Page, meetingTypes: string[]) {
  const records: EscribeMeetingRecord[] = [];

  for (const meetingType of meetingTypes) {
    let pageNumber = 1;
    let loaded = 0;
    let total = 0;

    do {
      const response = await page.evaluate<EscribePastMeetingsResponse, { meetingType: string; pageNumber: number }>(
        async ({ meetingType, pageNumber }) => {
          const result = await fetch("/MeetingsCalendarView.aspx/PastMeetings", {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({ type: meetingType, pageNumber })
          });
          if (!result.ok) throw new Error(`eSCRIBE past meetings returned HTTP ${result.status}.`);
          return result.json();
        },
        { meetingType, pageNumber }
      );
      const meetings = response.d?.Meetings || [];
      total = response.d?.TotalCount || meetings.length;
      records.push(...meetings.map((meeting) => ({
        ...meeting,
        section: "Past Meetings" as const
      })));
      loaded += meetings.length;
      pageNumber += 1;
      if (meetings.length === 0) break;
    } while (loaded < total && pageNumber <= 100);
  }

  return records;
}

function classifyItemAttachment(label: string): DocumentType {
  const classified = classifyEscribeDocument({
    Title: label,
    Type: "Attachment",
    Format: ".pdf"
  });
  return ["Staff Report", "Resolution", "Ordinance", "Contract", "Exhibit"].includes(classified)
    ? classified
    : "Attachment";
}

async function enrichHtmlAgenda(
  context: BrowserContext,
  meeting: PrimeGovMeeting,
  portalUrl: string
) {
  const htmlAgenda = meeting.documents.find((document) => document.type === "HTML Agenda");
  if (!htmlAgenda) return;
  const page = await context.newPage();

  try {
    // eSCRIBE's agenda is fully server-rendered. Third-party scripts and styles
    // can hold DOMContentLoaded open long enough to lose an otherwise complete
    // agenda, so do not load resources that are irrelevant to extraction.
    await page.route("**/*", async (route) => {
      if (route.request().resourceType() === "document") await route.continue();
      else await route.abort();
    });
    await page.goto(htmlAgenda.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(".Agenda", { timeout: 30_000 });
    const text = normalizePrimeGovHtmlAgendaText(await page.locator(".Agenda").innerText());
    if (isUsablePrimeGovHtmlAgendaText(text)) meeting.htmlAgendaText = text;

    const rawItems = await page.evaluate<Array<{
      id: string;
      agendaNumber: string | null;
      title: string;
      description: string | null;
      attachments: Array<{ label: string; url: string }>;
    }>>(String.raw`(() => {
      const compact = (value = "") => value.replace(/\s+/g, " ").trim();
      return Array.from(document.querySelectorAll(".Agenda .AgendaItem")).map((item) => {
        const titleRow = item.querySelector(":scope > .AgendaItemTitleRow, :scope > .ClosedAgendaItemTitleRow, :scope > .LateClosedAgendaItemTitleRow");
        const titleLink = titleRow?.querySelector(".AgendaItemTitle a");
        const classText = Array.from(item.classList).find((value) => /^AgendaItem\d+$/.test(value)) || "";
        const id = classText.match(/\d+/)?.[0] || titleLink?.getAttribute("href")?.match(/SelectItem\((\d+)/)?.[1] || "";
        const attachmentUrls = new Set();
        const attachments = Array.from(titleRow?.querySelectorAll(".AgendaItemAttachment a[href]") || [])
          .map((link) => ({ label: compact(link.textContent || "Attachment"), url: link.href }))
          .filter((attachment) => attachmentUrls.has(attachment.url) ? false : (attachmentUrls.add(attachment.url), true));
        return {
          id,
          agendaNumber: compact(titleRow?.querySelector(".AgendaItemCounter, .ClosedAgendaItemCounter")?.textContent || "") || null,
          title: compact(titleLink?.textContent || ""),
          description: compact(item.querySelector(":scope > .AgendaItemContentRow .AgendaItemDescription")?.textContent || "") || null,
          attachments
        };
      }).filter((item) => item.id && item.title);
    })()`);

    const items: AgendaItem[] = rawItems.map((item) => {
      const itemUrl = new URL(htmlAgenda.url);
      itemUrl.searchParams.set("Item", item.id);
      const attachments = item.attachments.map((attachment): PrimeGovDocument => ({
        type: classifyItemAttachment(attachment.label),
        label: attachment.label,
        url: absoluteEscribeUrl(attachment.url, portalUrl),
        parentDocumentUrl: htmlAgenda.url,
        isAgendaItemAttachment: true,
        agendaItemNumber: item.agendaNumber,
        agendaItemTitle: item.title
      }));
      return {
        externalId: `${meeting.externalId}:item:${item.id}`,
        fileNumber: null,
        agendaNumber: item.agendaNumber,
        itemType: "Agenda Item",
        title: item.title,
        action: item.description,
        result: null,
        sourceUrl: itemUrl.toString(),
        rowText: cleanText([item.agendaNumber, item.title, item.description].filter(Boolean).join(" ")),
        recommendedAction: item.description,
        attachments
      };
    });

    meeting.items = items;
    meeting.agendaItemInventoryComplete = true;
    const seenDocuments = new Set(meeting.documents.map((document) => document.url));
    for (const attachment of items.flatMap((item) => item.attachments || [])) {
      if (seenDocuments.has(attachment.url)) continue;
      seenDocuments.add(attachment.url);
      meeting.documents.push(attachment);
    }
  } catch (error) {
    meeting.extractionNotes = [
      ...(meeting.extractionNotes || []),
      `eSCRIBE HTML agenda enrichment failed: ${error instanceof Error ? error.message : String(error)}`
    ];
  } finally {
    await page.close();
  }
}

function isOfficialEscribeUrl(value: string, portalUrl: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === new URL(portalUrl).hostname;
  } catch {
    return false;
  }
}

export function shouldDownloadEscribeDocument(
  document: Pick<PrimeGovDocument, "type" | "url">,
  portalUrl: string
) {
  return (
    document.type !== "Public Comment" &&
    document.type !== "Public Comments" &&
    isOfficialEscribeUrl(document.url, portalUrl) &&
    /\/FileStream\.ashx/i.test(document.url)
  );
}

export async function scrapeEscribeMeetings(
  options: ScrapeEscribeOptions
): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const portalUrl = normalizedPortalUrl(
    options.portalUrl || options.jurisdiction.escribeUrl || options.jurisdiction.sourceUrl
  );
  const browser = await chromium.launch({ headless: !options.headful });
  const context = await browser.newContext({
    userAgent: ESCRIBE_USER_AGENT,
    viewport: { width: 1600, height: 1200 }
  });
  const page = await context.newPage();

  try {
    log(`Starting eSCRIBE scraper for ${options.jurisdiction.slug}.`);
    log(`eSCRIBE source URL: ${portalUrl}`);
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("#PastMeetingTypesAccordian, .upcoming-meetings", {
      timeout: 60_000
    });

    const meetingTypes = await page.locator(".MeetingTypeContainer").evaluateAll((containers) =>
      containers
        .map((container) => container.getAttribute("MeetingType") || "")
        .filter(Boolean)
    );
    const [upcoming, past] = await Promise.all([
      extractUpcomingRecords(page),
      fetchPastRecords(page, meetingTypes)
    ]);
    log(`eSCRIBE exposed ${upcoming.length} upcoming and ${past.length} past meeting record(s).`);

    let meetings = normalizeEscribeMeetingRecords(
      [...upcoming, ...past],
      options.jurisdiction,
      portalUrl
    );
    if (options.jurisdiction.escribeStartDate) {
      const startIso = parseMeetingDate(options.jurisdiction.escribeStartDate);
      if (!startIso) {
        throw new Error(
          `Invalid eSCRIBE start date for ${options.jurisdiction.slug}: ${options.jurisdiction.escribeStartDate}`
        );
      }
      const start = new Date(startIso).getTime();
      meetings = meetings.filter((meeting) => {
        const parsed = parseMeetingDate(
          [meeting.dateText, meeting.timeText].filter(Boolean).join(" ")
        );
        return parsed ? new Date(parsed).getTime() >= start : false;
      });
    }
    if (!options.allVisible) {
      meetings = meetings.filter((meeting) =>
        isMeetingDateInWindow(meeting.dateText, meeting.timeText, options)
      );
    }
    if (options.body) {
      const requestedBody = slugify(options.body);
      meetings = meetings.filter((meeting) =>
        slugify(meeting.bodyName || "") === requestedBody ||
        slugify(meeting.title).includes(requestedBody)
      );
    }
    if (options.limit) meetings = meetings.slice(0, options.limit);
    if (meetings.length === 0) {
      throw new Error("eSCRIBE scraper found zero valid meetings in the configured window.");
    }

    if (options.scrapeHtmlAgendas ?? true) {
      for (const meeting of meetings) {
        if (options.shouldStop?.()) break;
        await enrichHtmlAgenda(context, meeting, portalUrl);
      }
    }

    if (options.downloadDocuments ?? true) {
      const result = await downloadOfficialSiteDocuments(context, meetings, {
        outputDir: options.documentOutputDir,
        log,
        shouldStop: options.shouldStop,
        // Submitted comments remain linked as an official source, but their
        // bodies are neither downloaded nor extracted into SimpleCity.
        documentFilter: (document) => shouldDownloadEscribeDocument(document, portalUrl),
        validateFinalUrl: (url) => isOfficialEscribeUrl(url, portalUrl),
        userAgent: ESCRIBE_USER_AGENT
      });
      log(`eSCRIBE document downloads complete: ${result.downloaded} downloaded, ${result.failed} failed.`);
    }

    log(`eSCRIBE scraper completed with ${meetings.length} meeting(s).`);
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
