import crypto from "node:crypto";
import { chromium, type Page } from "playwright";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type { DocumentType, MeetingStatus, PrimeGovDocument, PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { cleanText, slugify } from "@/lib/utils/slug";
import { parseMeetingDate } from "@/lib/utils/date";
import { filterMeetingsToWindow, getMeetingWindow } from "@/lib/utils/meetingWindow";
import {
  discoverMenloParkAgendaAttachments,
  MENLO_PARK_ATTACHMENT_MAX_BYTES,
  MENLO_PARK_ATTACHMENT_TIMEOUT_MS,
  normalizeMenloParkAttachmentUrl
} from "@/lib/scraper/agendaAttachments";

export const DEFAULT_MENLO_PARK_AGENDAS_URL =
  "https://www.menlopark.gov/Agendas-and-minutes";

export type MenloParkBodyConfig = {
  bodyName: string;
  sectionId: string;
  url: string;
};

export const MENLO_PARK_BODIES: MenloParkBodyConfig[] = [
  {
    bodyName: "City Council",
    sectionId: "section-2",
    url: `${DEFAULT_MENLO_PARK_AGENDAS_URL}#section-2`
  },
  {
    bodyName: "Complete Streets Commission",
    sectionId: "section-3",
    url: `${DEFAULT_MENLO_PARK_AGENDAS_URL}#section-3`
  },
  {
    bodyName: "Environmental Quality Commission",
    sectionId: "section-4",
    url: `${DEFAULT_MENLO_PARK_AGENDAS_URL}#section-4`
  },
  {
    bodyName: "Finance and Audit Commission",
    sectionId: "section-5",
    url: `${DEFAULT_MENLO_PARK_AGENDAS_URL}#section-5`
  },
  {
    bodyName: "Housing Commission",
    sectionId: "section-6",
    url: `${DEFAULT_MENLO_PARK_AGENDAS_URL}#section-6`
  },
  {
    bodyName: "Library Commission",
    sectionId: "section-7",
    url: `${DEFAULT_MENLO_PARK_AGENDAS_URL}#section-7`
  },
  {
    bodyName: "Parks and Recreation Commission",
    sectionId: "section-8",
    url: `${DEFAULT_MENLO_PARK_AGENDAS_URL}#section-8`
  },
  {
    bodyName: "Planning Commission",
    sectionId: "section-9",
    url: `${DEFAULT_MENLO_PARK_AGENDAS_URL}#section-9`
  }
];

export type ScrapeMenloParkOptions = ScrapePortalOptions & {
  jurisdiction: JurisdictionConfig;
  year?: number;
  body?: string;
  limit?: number;
  monthsBack?: number;
  monthsForward?: number;
  allVisible?: boolean;
};

type ExtractedLink = {
  label: string;
  url: string;
  column: string | null;
};

export type MenloParkExtractedRow = {
  bodyName: string;
  sectionId: string;
  sectionUrl: string;
  year: string | null;
  dateText: string | null;
  rowText: string;
  links: ExtractedLink[];
  actionLinks: ExtractedLink[];
};

type ExtractionResult = {
  rows: MenloParkExtractedRow[];
  warnings: string[];
  bodyStats: Array<{
    bodyName: string;
    rowsFound: number;
    actionLinksFound: number;
    year: string | null;
  }>;
};

const DOWNLOADABLE_DOCUMENT_TYPES = new Set<DocumentType>([
  "Agenda",
  "Agenda Packet",
  "Minutes",
  "Notice of Cancellation",
  "Special Event Notice",
  "Early Staff Report Release",
  "Document",
  "Attachment"
]);

const TIME_SOURCE_DOCUMENT_TYPES = new Set<DocumentType>([
  "Agenda",
  "Agenda Packet",
  "Notice of Cancellation",
  "Special Event Notice"
]);

function normalizeForMatch(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanLabel(value = "") {
  return cleanText(value.replace(/\u00a0/g, " "));
}

function isPdfLikeUrl(url: string) {
  const lower = url.toLowerCase();
  return lower.includes(".pdf") || lower.includes("/files/") || lower.includes("document");
}

function normalizeAgendaTime(hourText: string, minuteText: string | undefined, meridiemText: string) {
  const hour = Number(hourText);
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return null;

  const minute = Number((minuteText || "0").replace(/\D/g, ""));
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  const meridiem = meridiemText.toLowerCase().replace(/[^apm]/g, "");
  if (meridiem !== "am" && meridiem !== "pm") return null;

  return `${hour}:${String(minute).padStart(2, "0")} ${meridiem[0]}.m.`;
}

function normalizeAgendaTimeMatch(match: RegExpMatchArray | null) {
  return match ? normalizeAgendaTime(match[1], match[2], match[3]) : null;
}

export function extractMenloParkAgendaTimeText(text?: string | null) {
  const normalized = cleanText(String(text || "").replace(/\u00a0/g, " "));
  if (!normalized) return null;

  const head = normalized.slice(0, 12000).replace(/\s+/g, " ");
  const timePattern = String.raw`(\d{1,2})(?::([0-5]\s*\d))?\s*(?:(?:-|–|—|\bto\b)\s*\d{1,2}(?::[0-5]\s*\d)?\s*)?([ap]\.?\s*m\.?)`;
  const patterns = [
    new RegExp(String.raw`\bTime\s*:?\s*(?:approximately\s*)?${timePattern}`, "i"),
    new RegExp(String.raw`\b(?:meeting|session|hearing)\s+(?:will\s+)?(?:begin|start|starts|convene|commence)s?\s+(?:at\s+)?${timePattern}`, "i"),
    new RegExp(String.raw`\b(?:begins?|starts?|convenes?|commences?)\s+(?:at\s+)?${timePattern}`, "i"),
    new RegExp(String.raw`\b(?:regular|special|adjourned|closed)\s+(?:meeting|session|hearing)\s+${timePattern}`, "i"),
    new RegExp(String.raw`\b(?:meeting|session|hearing)\s+${timePattern}`, "i")
  ];

  for (const pattern of patterns) {
    const timeText = normalizeAgendaTimeMatch(head.match(pattern));
    if (timeText) return timeText;
  }

  return null;
}

function agendaTimeSourceDocuments(meeting: PrimeGovMeeting) {
  return meeting.documents
    .filter((doc) => TIME_SOURCE_DOCUMENT_TYPES.has(doc.type))
    .sort((left, right) => {
      const rank = (doc: PrimeGovDocument) =>
        doc.type === "Agenda Packet" ? 0 : doc.type === "Agenda" ? 1 : 2;
      return rank(left) - rank(right);
    });
}

export function enrichMenloParkMeetingTimesFromAgendaText(meetings: PrimeGovMeeting[]) {
  let enriched = 0;

  for (const meeting of meetings) {
    if (meeting.jurisdictionSlug !== "menlo-park") continue;
    if (meeting.timeText) continue;

    for (const doc of agendaTimeSourceDocuments(meeting)) {
      const timeText = extractMenloParkAgendaTimeText(doc.extractedText);
      if (!timeText) continue;

      meeting.timeText = timeText;
      meeting.extractionNotes = [
        ...(meeting.extractionNotes || []),
        `Extracted meeting time (${timeText}) from Menlo Park ${doc.type.toLowerCase()} text.`
      ];
      enriched += 1;
      break;
    }
  }

  return enriched;
}

export function classifyMenloParkLink(label = "", href = ""): DocumentType {
  const cleanedLabel = cleanLabel(label);
  const text = normalizeForMatch(cleanedLabel);
  const url = href.toLowerCase();

  if (text.includes("cancellation notice") || text.includes("notice of cancellation")) {
    return "Notice of Cancellation";
  }

  if (text.includes("special event notice")) {
    return "Special Event Notice";
  }

  if (text.includes("early staff report release")) {
    return "Early Staff Report Release";
  }

  if (text.includes("agenda packet")) {
    return "Agenda Packet";
  }

  if (text === "agenda" || text.includes("agenda")) {
    return "Agenda";
  }

  if (text.includes("minutes")) {
    return "Minutes";
  }

  if (text.includes("spanish interpretation") || text.includes("interpretacion")) {
    return "Spanish Interpretation Form";
  }

  if (text.includes("transportation") || text.includes("transporte")) {
    return "Transportation Form";
  }

  if (
    (text.includes("video") && text.includes("espanol")) ||
    text.includes("spanish video")
  ) {
    return "Spanish Video";
  }

  if (text.includes("video") || url.includes("youtu.be") || url.includes("youtube.com")) {
    return "Video";
  }

  if (text.includes("zoom") || url.includes("zoom.us")) {
    return "Zoom";
  }

  if (isPdfLikeUrl(url)) {
    return "Document";
  }

  return "Other";
}

function shouldIgnoreMenloParkLink(label = "", href = "") {
  const text = normalizeForMatch(label);
  const url = href.toLowerCase();

  return (
    !href ||
    url.startsWith("mailto:") ||
    url.startsWith("tel:") ||
    url.startsWith("javascript:") ||
    url.endsWith("#") ||
    url.includes("facebook.com") ||
    url.includes("twitter.com") ||
    url.includes("x.com") ||
    url.includes("linkedin.com") ||
    url.includes("instagram.com") ||
    text.includes("get assistance with agenda files") ||
    text.includes("city clerk") ||
    text.includes("skip to main content") ||
    text === "share" ||
    text === "email" ||
    text === "print" ||
    text === "back to top"
  );
}

export function getMenloParkBodies(body?: string | null) {
  if (!body) return [...MENLO_PARK_BODIES];

  const requested = slugify(body);
  return MENLO_PARK_BODIES.filter(
    (config) =>
      slugify(config.bodyName) === requested ||
      slugify(config.sectionId) === requested ||
      config.sectionId.toLowerCase() === String(body).toLowerCase()
  );
}

function stableHash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 12);
}

function primaryDocumentSlug(documents: PrimeGovDocument[]) {
  const primary =
    documents.find((doc) => doc.type === "Agenda Packet") ||
    documents.find((doc) => doc.type === "Agenda") ||
    documents.find((doc) => doc.type === "Notice of Cancellation") ||
    documents.find((doc) => doc.type === "Special Event Notice") ||
    documents.find((doc) => doc.type === "Early Staff Report Release") ||
    documents.find((doc) => DOWNLOADABLE_DOCUMENT_TYPES.has(doc.type));

  if (!primary) return null;

  try {
    const parsed = new URL(primary.url);
    return slugify(
      parsed.pathname.split("/").filter(Boolean).at(-1) ||
        primary.label ||
        primary.type
    );
  } catch {
    return slugify(primary.label || primary.type || primary.url);
  }
}

function rowTypeFromDocuments(documents: PrimeGovDocument[], rowText: string) {
  const text = normalizeForMatch(rowText);

  if (
    documents.some((doc) => doc.type === "Notice of Cancellation") ||
    text.includes("cancellation notice") ||
    text.includes("cancel")
  ) {
    return "cancellation-notice";
  }

  if (documents.some((doc) => doc.type === "Special Event Notice")) {
    return "special-event-notice";
  }

  if (
    documents.some((doc) => doc.type === "Early Staff Report Release") &&
    !documents.some((doc) => doc.type === "Agenda" || doc.type === "Agenda Packet")
  ) {
    return "early-staff-report-release";
  }

  return "agenda";
}

function statusFromRow(
  dateText: string | null,
  rowType: string,
  documents: PrimeGovDocument[],
  rowText: string
): MeetingStatus {
  const text = normalizeForMatch(rowText);

  if (
    rowType === "cancellation-notice" ||
    documents.some((doc) => doc.type === "Notice of Cancellation") ||
    text.includes("cancel")
  ) {
    return "Cancelled";
  }

  if (rowType === "special-event-notice") return "Notice";
  if (rowType === "early-staff-report-release") return "Staff Report Release";

  const parsed = parseMeetingDate(dateText);
  if (!parsed) return "Unknown";
  return new Date(parsed).getTime() >= Date.now() ? "Upcoming" : "Past";
}

function sectionFromStatus(status: MeetingStatus, dateText: string | null) {
  if (status === "Upcoming") return "Upcoming Meetings";

  const parsed = parseMeetingDate(dateText);
  if (parsed && new Date(parsed).getTime() >= Date.now()) return "Upcoming Meetings";
  return "Past Meetings";
}

function makeExternalId(input: {
  bodyName: string;
  dateText: string | null;
  rowType: string;
  documents: PrimeGovDocument[];
  rowText: string;
}) {
  const bodySlug = slugify(input.bodyName);
  const dateSlug = slugify(input.dateText || "no-date");
  const docSlug = primaryDocumentSlug(input.documents);

  if (docSlug) {
    return `menlo-park-official-site-${bodySlug}-${dateSlug}-${input.rowType}-${docSlug}`;
  }

  return `menlo-park-${bodySlug}-${dateSlug}-${stableHash({
    bodyName: input.bodyName,
    dateText: input.dateText,
    rowType: input.rowType,
    documentUrls: input.documents.map((doc) => doc.url).sort(),
    rowText: input.rowText
  })}`;
}

function dedupeDocuments(documents: PrimeGovDocument[]) {
  const seen = new Set<string>();
  const result: PrimeGovDocument[] = [];

  for (const document of documents) {
    const key = `${document.type}|${document.label}|${document.url}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(document);
  }

  return result;
}

function normalizeLinkToDocument(
  link: ExtractedLink,
  jurisdiction: JurisdictionConfig,
  options: { allowActionResource: boolean }
): PrimeGovDocument | null {
  if (shouldIgnoreMenloParkLink(link.label, link.url)) return null;

  const type = classifyMenloParkLink(link.label, link.url);
  const isActionResource =
    type === "Zoom" ||
    type === "Spanish Interpretation Form" ||
    type === "Transportation Form";

  if (type === "Other") return null;
  if (isActionResource && !options.allowActionResource) return null;

  return {
    jurisdictionName: jurisdiction.name,
    jurisdictionSlug: jurisdiction.slug,
    platform: jurisdiction.platform,
    type,
    label: cleanLabel(link.label) || type,
    url: link.url
  };
}

function mergeEarlyStaffReports(meetings: PrimeGovMeeting[]) {
  const regularByBodyDate = new Map<string, PrimeGovMeeting>();

  for (const meeting of meetings) {
    const key = `${meeting.bodyName || meeting.meetingType}|${meeting.dateText || ""}`;
    const hasAgenda = meeting.documents.some(
      (doc) => doc.type === "Agenda" || doc.type === "Agenda Packet"
    );

    if (hasAgenda && meeting.status !== "Staff Report Release") {
      regularByBodyDate.set(key, meeting);
    }
  }

  const result: PrimeGovMeeting[] = [];

  for (const meeting of meetings) {
    if (meeting.status !== "Staff Report Release") {
      result.push(meeting);
      continue;
    }

    const key = `${meeting.bodyName || meeting.meetingType}|${meeting.dateText || ""}`;
    const regular = regularByBodyDate.get(key);
    if (!regular) {
      result.push(meeting);
      continue;
    }

    regular.documents = dedupeDocuments([...regular.documents, ...meeting.documents]);
    regular.rowText = cleanText(`${regular.rowText}\n${meeting.rowText}`);
    regular.hasPdf = regular.documents.some((doc) => DOWNLOADABLE_DOCUMENT_TYPES.has(doc.type));
    regular.extractionNotes = [
      ...(regular.extractionNotes || []),
      `Grouped early staff report release from ${meeting.sourceUrl || meeting.sectionUrl || "Menlo Park source row"}.`
    ];
  }

  return result;
}

export function normalizeMenloParkRows(
  rows: MenloParkExtractedRow[],
  jurisdiction: JurisdictionConfig
) {
  const meetings: PrimeGovMeeting[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const rowDocuments = row.links
      .map((link) => normalizeLinkToDocument(link, jurisdiction, { allowActionResource: false }))
      .filter((doc): doc is PrimeGovDocument => Boolean(doc));
    const actionDocuments = row.actionLinks
      .map((link) => normalizeLinkToDocument(link, jurisdiction, { allowActionResource: true }))
      .filter((doc): doc is PrimeGovDocument => Boolean(doc));
    const documents = dedupeDocuments([...rowDocuments, ...actionDocuments]);
    const rowType = rowTypeFromDocuments(documents, row.rowText);
    const dedupeKey = [
      row.bodyName,
      row.dateText || "",
      rowType,
      documents.map((doc) => `${doc.type}:${doc.url}`).sort().join("|")
    ].join("|");

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const status = statusFromRow(row.dateText, rowType, documents, row.rowText);
    const primaryDocument =
      documents.find((doc) => doc.type === "Agenda Packet") ||
      documents.find((doc) => doc.type === "Agenda") ||
      documents.find((doc) => doc.type === "Notice of Cancellation") ||
      documents.find((doc) => doc.type === "Special Event Notice") ||
      documents.find((doc) => doc.type === "Early Staff Report Release") ||
      documents[0];
    const extractionNotes = [
      "Official Menlo Park page lists date but not meeting time.",
      ...(actionDocuments.length > 0
        ? ["Attached Menlo Park City Council action resource links from the official page."]
        : [])
    ];

    const meeting: PrimeGovMeeting = {
      externalId: makeExternalId({
        bodyName: row.bodyName,
        dateText: row.dateText,
        rowType,
        documents,
        rowText: row.rowText
      }),
      jurisdictionName: jurisdiction.name,
      jurisdictionSlug: jurisdiction.slug,
      platform: jurisdiction.platform,
      source: jurisdiction.sourceUrl,
      section: sectionFromStatus(status, row.dateText),
      title: `${row.bodyName} - ${row.dateText || "Date not listed"}`,
      bodyName: row.bodyName,
      meetingType: row.bodyName,
      dateText: row.dateText,
      timeText: null,
      location: null,
      rowText: row.rowText,
      status,
      sourceUrl: primaryDocument?.url || row.sectionUrl,
      sectionUrl: row.sectionUrl,
      meetingDetailsUrl: row.sectionUrl,
      hasHtmlAgenda: false,
      hasPdf: documents.some((doc) => DOWNLOADABLE_DOCUMENT_TYPES.has(doc.type)),
      documents,
      extractionNotes
    };

    meetings.push(meeting);
  }

  return mergeEarlyStaffReports(meetings);
}

export function filterMenloParkMeetingsByDateWindow(
  meetings: PrimeGovMeeting[],
  monthsBack = 1,
  monthsForward = 1,
  now = new Date()
) {
  return filterMeetingsToWindow(meetings, { monthsBack, monthsForward }, now);
}

function yearsInMenloParkDateWindow(monthsBack: number, monthsForward: number, now = new Date()) {
  const window = getMeetingWindow({ monthsBack, monthsForward }, now);
  const civicYear = (timestamp: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric"
    }).formatToParts(new Date(timestamp));
    return Number(parts.find((part) => part.type === "year")?.value);
  };
  const startYear = civicYear(window.start);
  const endYear = civicYear(window.end - 1);

  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

async function waitForMenloParkPage(page: Page, sourceUrl: string) {
  await page.goto(sourceUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForLoadState("load", { timeout: 15000 }).catch(() => undefined);
  await page.waitForSelector("text=Agendas and minutes", { timeout: 60000 });
  await page.waitForTimeout(1000);
}

async function extractMenloParkRows(
  page: Page,
  bodies: MenloParkBodyConfig[],
  options: { targetYears: number[]; allYears?: boolean }
): Promise<ExtractionResult> {
  await page.evaluate("globalThis.__name = (value) => value");

  return page.evaluate(
    ({ bodies, targetYears, allYears }) => {
      function cleanTextInPage(value = "") {
        return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      }

      const nodeOrder = new Map(
        Array.from(document.querySelectorAll("body *")).map((element, index) => [element, index])
      );

      function yPos(element: Element) {
        return nodeOrder.get(element) ?? 0;
      }

      function normalized(value = "") {
        return cleanTextInPage(value)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
      }

      function absoluteUrl(href: string | null) {
        if (!href) return null;

        try {
          const parsed = new URL(href, window.location.href);
          if (!["http:", "https:"].includes(parsed.protocol)) return null;
          return parsed.toString();
        } catch {
          return null;
        }
      }

      function urlFromOnclick(onclick: string | null) {
        if (!onclick) return null;
        const match =
          onclick.match(/window\.open\(\s*['"]([^'"]+)['"]/i) ||
          onclick.match(/OpenWindow\(\s*['"]([^'"]+)['"]/i) ||
          onclick.match(/https?:\/\/[^'")\s]+|\/[A-Za-z0-9_./?=&:%-]+/);
        return absoluteUrl(match?.[1] || match?.[0] || null);
      }

      function elementUrl(element: Element) {
        const attrs = ["href", "data-url", "data-href", "data-link", "data-target", "data-src"];
        for (const attr of attrs) {
          const url = absoluteUrl(element.getAttribute(attr));
          if (url) return url;
        }
        return urlFromOnclick(element.getAttribute("onclick"));
      }

      function elementLabel(element: Element) {
        const image = element.querySelector("img");
        return cleanTextInPage(
          (element as HTMLElement).innerText ||
            element.textContent ||
            image?.getAttribute("alt") ||
            image?.getAttribute("title") ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            ""
        );
      }

      function dateMatch(value = "") {
        return cleanTextInPage(value).match(
          /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},\s+\d{4}\b/i
        );
      }

      const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
      const pageTitleY =
        headings
          .filter((heading) => normalized((heading as HTMLElement).innerText || heading.textContent || "") === "agendas and minutes")
          .map(yPos)
          .sort((left, right) => left - right)[0] || 0;

      function findHeading(bodyName: string, sectionId: string) {
        const sectionElement = document.getElementById(sectionId);
        if (sectionElement) {
          const ownText = cleanTextInPage(
            (sectionElement as HTMLElement).innerText || sectionElement.textContent || ""
          );
          if (normalized(ownText) === normalized(bodyName)) return sectionElement;

          const nestedHeading = Array.from(sectionElement.querySelectorAll("h1,h2,h3,h4,h5,h6")).find(
            (candidate) =>
              normalized((candidate as HTMLElement).innerText || candidate.textContent || "") ===
              normalized(bodyName)
          );
          if (nestedHeading) return nestedHeading;
        }

        const matches = headings
          .filter((heading) => {
            const text = (heading as HTMLElement).innerText || heading.textContent || "";
            return normalized(text) === normalized(bodyName) && yPos(heading) > pageTitleY;
          })
          .sort((left, right) => yPos(left) - yPos(right));

        return matches[0] || null;
      }

      const headingEntries = bodies
        .map((body) => ({
          ...body,
          heading: findHeading(body.bodyName, body.sectionId)
        }))
        .filter((entry): entry is typeof entry & { heading: Element } => Boolean(entry.heading))
        .map((entry) => ({
          ...entry,
          headingY: yPos(entry.heading)
        }))
        .sort((left, right) => left.headingY - right.headingY);

      function nextBodyY(currentY: number) {
        return headingEntries
          .map((entry) => entry.headingY)
          .filter((value) => value > currentY)
          .sort((left, right) => left - right)[0] || Number.POSITIVE_INFINITY;
      }

      function previousSectionY(bodyName: string, currentY: number) {
        const previousLabel = `previous ${bodyName} agendas, minutes and staff reports`;
        return headings
          .filter((heading) => {
            const text = normalized((heading as HTMLElement).innerText || heading.textContent || "");
            return text === previousLabel && yPos(heading) > currentY;
          })
          .map(yPos)
          .sort((left, right) => left - right)[0] || Number.POSITIVE_INFINITY;
      }

      function allElementCandidates() {
        return Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,div,span"));
      }

      function findYearElements(startY: number, endY: number) {
        const candidates = allElementCandidates()
          .filter((element) => {
            const text = cleanTextInPage(
              (element as HTMLElement).innerText || element.textContent || ""
            );
            const y = yPos(element);
            return /^\d{4}$/.test(text) && y > startY && y < endY;
          })
          .sort((left, right) => yPos(left) - yPos(right));

        if (allYears) return candidates;

        const requestedYears = new Set(targetYears.map(String));
        const requested = candidates.filter((element) =>
          requestedYears.has(
            cleanTextInPage((element as HTMLElement).innerText || element.textContent || "")
          )
        );

        return requested.length > 0 ? requested : candidates.slice(0, 1);
      }

      function linksInElement(element: Element, column: string | null) {
        return Array.from(
          element.querySelectorAll("a[href], [onclick], [data-url], [data-href], [data-link], [data-target], [data-src]")
        )
          .map((link) => ({
            label: elementLabel(link),
            url: elementUrl(link),
            column
          }))
          .filter((link): link is { label: string; url: string; column: string | null } =>
            Boolean(link.url)
          );
      }

      function linksBetween(startY: number, endY: number, column: string | null) {
        return Array.from(
          document.querySelectorAll("a[href], [onclick], [data-url], [data-href], [data-link], [data-target], [data-src]")
        )
          .filter((link) => {
            const y = yPos(link);
            return y > startY && y < endY;
          })
          .map((link) => ({
            label: elementLabel(link),
            url: elementUrl(link),
            column
          }))
          .filter((link): link is { label: string; url: string; column: string | null } =>
            Boolean(link.url)
          );
      }

      function headerName(value = "") {
        const text = normalized(value);
        if (text.includes("meeting date") || text === "date") return "Meeting date";
        if (text.includes("agenda")) return "Agenda";
        if (text.includes("minutes")) return "Minutes";
        if (text.includes("video")) return "Video";
        return text;
      }

      function extractTableRows(
        table: HTMLTableElement,
        body: { bodyName: string; sectionId: string; url: string },
        yearText: string,
        actionLinks: Array<{ label: string; url: string; column: string | null }>
      ) {
        const rows = Array.from(table.querySelectorAll("tr"));
        const headerIndex = rows.findIndex((row) => {
          const text = normalized((row as HTMLElement).innerText || row.textContent || "");
          return text.includes("meeting date") && text.includes("agenda");
        });
        const headerCells =
          headerIndex >= 0
            ? Array.from(rows[headerIndex].querySelectorAll("th,td")).map((cell) =>
                headerName((cell as HTMLElement).innerText || cell.textContent || "")
              )
            : [];
        const dataRows = rows.slice(headerIndex >= 0 ? headerIndex + 1 : 0);

        return dataRows.flatMap((row) => {
          const rowText = cleanTextInPage((row as HTMLElement).innerText || row.textContent || "");
          if (!rowText) return [];

          const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td"));
          const dateCellIndex = headerCells.findIndex((header) => header === "Meeting date");
          const dateText =
            dateMatch(
              dateCellIndex >= 0 && cells[dateCellIndex]
                ? (cells[dateCellIndex] as HTMLElement).innerText || cells[dateCellIndex].textContent || ""
                : rowText
            )?.[0] ||
            dateMatch(rowText)?.[0] ||
            null;

          if (!dateText) return [];

          const links =
            cells.length > 0
              ? cells.flatMap((cell, index) => {
                  const column =
                    headerCells[index] ||
                    (index === 1 ? "Agenda" : index === 2 ? "Minutes" : index === 3 ? "Video" : null);
                  return linksInElement(cell, column);
                })
              : linksInElement(row, null);

          return [
            {
              bodyName: body.bodyName,
              sectionId: body.sectionId,
              sectionUrl: body.url,
              year: yearText,
              dateText,
              rowText,
              links,
              actionLinks
            }
          ];
        });
      }

      function extractFallbackRows(
        startY: number,
        endY: number,
        body: { bodyName: string; sectionId: string; url: string },
        yearText: string,
        actionLinks: Array<{ label: string; url: string; column: string | null }>
      ) {
        const candidates = Array.from(document.querySelectorAll("tr,li,p"))
          .filter((element) => {
            const y = yPos(element);
            const text = cleanTextInPage((element as HTMLElement).innerText || element.textContent || "");
            return y > startY && y < endY && text.length < 1200 && Boolean(dateMatch(text));
          })
          .sort((left, right) => yPos(left) - yPos(right));

        return candidates.map((element) => {
          const rowText = cleanTextInPage((element as HTMLElement).innerText || element.textContent || "");
          return {
            bodyName: body.bodyName,
            sectionId: body.sectionId,
            sectionUrl: body.url,
            year: yearText,
            dateText: dateMatch(rowText)?.[0] || null,
            rowText,
            links: linksInElement(element, null),
            actionLinks
          };
        });
      }

      const warnings: string[] = [];
      const rows: MenloParkExtractedRow[] = [];
      const bodyStats: ExtractionResult["bodyStats"] = [];

      for (const body of bodies) {
        const headingEntry = headingEntries.find((entry) => entry.bodyName === body.bodyName);
        if (!headingEntry) {
          warnings.push(`Menlo Park body section was not found: ${body.bodyName}.`);
          bodyStats.push({ bodyName: body.bodyName, rowsFound: 0, actionLinksFound: 0, year: null });
          continue;
        }

        const startY = headingEntry.headingY;
        const endY = Math.min(nextBodyY(startY), previousSectionY(body.bodyName, startY));
        const yearElements = findYearElements(startY, endY);
        if (yearElements.length === 0) {
          warnings.push(`Current year heading was not found for ${body.bodyName}.`);
          bodyStats.push({ bodyName: body.bodyName, rowsFound: 0, actionLinksFound: 0, year: null });
          continue;
        }

        let bodyRowCount = 0;
        let actionLinksFound = 0;
        let firstYear: string | null = null;

        for (const yearElement of yearElements) {
          const yearY = yPos(yearElement);
          const yearText = cleanTextInPage(
            (yearElement as HTMLElement).innerText || yearElement.textContent || ""
          );
          firstYear ||= yearText;
          const nextYearY =
            yearElements
              .map(yPos)
              .filter((value) => value > yearY)
              .sort((left, right) => left - right)[0] || endY;
          const tableEndY = Math.min(nextYearY, endY);
          const actionLinks = linksBetween(startY, yearY, null);
          actionLinksFound = actionLinks.length;

          const candidateTables = Array.from(document.querySelectorAll("table"))
            .filter((candidate) => {
              const y = yPos(candidate);
              return y > yearY && y < tableEndY;
            })
            .sort((left, right) => yPos(left) - yPos(right)) as HTMLTableElement[];
          const table =
            candidateTables.find((candidate) => {
              const text = cleanTextInPage(
                (candidate as HTMLElement).innerText || candidate.textContent || ""
              );
              const lower = normalized(text);
              return lower.includes("meeting date") && lower.includes("agenda") && Boolean(dateMatch(text));
            }) ||
            candidateTables.find((candidate) =>
              cleanTextInPage((candidate as HTMLElement).innerText || candidate.textContent || "")
            );

          const extracted = table
            ? extractTableRows(table, body, yearText, actionLinks)
            : extractFallbackRows(yearY, tableEndY, body, yearText, actionLinks);

          if (!table) {
            warnings.push(`No table found for ${body.bodyName} ${yearText}; used DOM proximity extraction.`);
          }

          rows.push(...extracted);
          bodyRowCount += extracted.length;
        }

        bodyStats.push({
          bodyName: body.bodyName,
          rowsFound: bodyRowCount,
          actionLinksFound,
          year: firstYear
        });
      }

      return { rows, warnings, bodyStats };
    },
    {
      bodies: bodies.map((body) => ({
        bodyName: body.bodyName,
        sectionId: body.sectionId,
        url: body.url
      })),
      targetYears: options.targetYears,
      allYears: Boolean(options.allYears)
    }
  );
}

function countByStatus(meetings: PrimeGovMeeting[], status: MeetingStatus) {
  return meetings.filter((meeting) => meeting.status === status).length;
}

export async function scrapeMenloParkMeetings(
  options: ScrapeMenloParkOptions
): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const jurisdiction = options.jurisdiction;
  const portalUrl = options.portalUrl || jurisdiction.officialSiteUrl || jurisdiction.sourceUrl;
  const bodies = getMenloParkBodies(options.body).map((body) => ({
    ...body,
    url: `${portalUrl.split("#")[0]}#${body.sectionId}`
  }));
  const monthsBack = Math.max(0, options.monthsBack ?? 1);
  const monthsForward = Math.max(0, options.monthsForward ?? 1);
  const targetYears = options.year
    ? [options.year]
    : yearsInMenloParkDateWindow(monthsBack, monthsForward);

  if (bodies.length === 0) {
    throw new Error(`No Menlo Park meeting body matched: ${options.body}`);
  }

  const browser = await chromium.launch({
    headless: !options.headful
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 SimpleCity Menlo Park official-site scraper",
    viewport: {
      width: 1600,
      height: 1200
    }
  });
  const page = await context.newPage();

  try {
    log(`Starting Menlo Park official-site scraper for ${portalUrl}.`);
    log(`Scraping Menlo Park meeting bodies: ${bodies.map((body) => body.bodyName).join(", ")}.`);
    await waitForMenloParkPage(page, portalUrl);

    const extracted = await extractMenloParkRows(page, bodies, {
      targetYears,
      allYears: options.allYears || options.allVisible
    });

    for (const warning of extracted.warnings) log(warning);
    for (const stat of extracted.bodyStats) {
      log(
        `Menlo Park ${stat.bodyName}: ${stat.rowsFound} row(s) found for ${stat.year || "unknown year"}; ${stat.actionLinksFound} action link(s).`
      );
    }

    let meetings = normalizeMenloParkRows(extracted.rows, jurisdiction);
    if (!options.year && !options.allYears && !options.allVisible) {
      meetings = filterMenloParkMeetingsByDateWindow(meetings, monthsBack, monthsForward);
      log(
        `Menlo Park meetings in configured window (${monthsBack} month(s) back, ${monthsForward} month(s) forward): ${meetings.length}.`
      );
    }
    if (options.limit) meetings = meetings.slice(0, options.limit);

    const cancellationCount = countByStatus(meetings, "Cancelled");
    const noticeCount = countByStatus(meetings, "Notice");
    const staffReportCount = meetings.reduce(
      (sum, meeting) =>
        sum + meeting.documents.filter((doc) => doc.type === "Early Staff Report Release").length,
      0
    );
    const documentCount = meetings.reduce((sum, meeting) => sum + meeting.documents.length, 0);
    const recordingCount = meetings.reduce(
      (sum, meeting) =>
        sum +
        meeting.documents.filter((doc) => doc.type === "Video" || doc.type === "Spanish Video")
          .length,
      0
    );
    const spanishVideoCount = meetings.reduce(
      (sum, meeting) => sum + meeting.documents.filter((doc) => doc.type === "Spanish Video").length,
      0
    );

    log(`Menlo Park unique meetings after deduplication: ${meetings.length}.`);
    log(`Menlo Park cancellation notices found: ${cancellationCount}.`);
    log(`Menlo Park special event notices found: ${noticeCount}.`);
    log(`Menlo Park early staff report releases found: ${staffReportCount}.`);
    log(`Menlo Park documents found: ${documentCount}.`);
    log(`Menlo Park recordings found: ${recordingCount}.`);
    log(`Menlo Park Spanish videos found: ${spanishVideoCount}.`);

    if (meetings.length === 0) {
      throw new Error("Menlo Park scraper found zero valid meetings across all configured bodies.");
    }

    if (options.downloadDocuments) {
      const { downloadOfficialSiteDocuments } = await import("@/lib/scraper/downloadDocuments");
      log("Downloading Menlo Park official-site documents.");
      const downloadResult = await downloadOfficialSiteDocuments(context, meetings, {
        log,
        outputDir: options.documentOutputDir,
        shouldStop: options.shouldStop
      });
      log(
        `Menlo Park document downloads complete: ${downloadResult.downloaded} downloaded, ${downloadResult.failed} failed.`
      );

      if (options.enrichAgendaAttachments !== false && !options.shouldStop?.()) {
        log("Discovering item-aware links in Menlo Park agenda PDFs.");
        const discoveryResult = await discoverMenloParkAgendaAttachments(meetings, {
          log,
          shouldStop: options.shouldStop
        });
        log(
          `Menlo Park agenda attachment discovery complete: ${discoveryResult.discovered} new document(s), ${discoveryResult.skipped} agenda(s) skipped.`
        );

        if (discoveryResult.discovered > 0 && !options.shouldStop?.()) {
          const attachmentDownloadResult = await downloadOfficialSiteDocuments(context, meetings, {
            log,
            outputDir: options.documentOutputDir,
            shouldStop: options.shouldStop,
            onlyPending: true,
            maxBytes: MENLO_PARK_ATTACHMENT_MAX_BYTES,
            timeoutMs: MENLO_PARK_ATTACHMENT_TIMEOUT_MS,
            validateFinalUrl: (url) => Boolean(normalizeMenloParkAttachmentUrl(url))
          });
          log(
            `Menlo Park item attachment downloads complete: ${attachmentDownloadResult.downloaded} downloaded, ${attachmentDownloadResult.failed} failed.`
          );
        }
      } else if (options.enrichAgendaAttachments === false) {
        log("Menlo Park item-aware agenda attachment enrichment is disabled.");
      }
    }

    return {
      source: portalUrl,
      scrapedAt: new Date().toISOString(),
      totalMeetingCount: meetings.length,
      currentAndUpcomingCount: countByStatus(meetings, "Upcoming"),
      archivedCount: countByStatus(meetings, "Past"),
      meetings
    };
  } finally {
    await browser.close();
  }
}
