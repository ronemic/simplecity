import fs from "node:fs/promises";
import path from "node:path";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type { AgendaItem, DocumentType, PrimeGovDocument, PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { getJurisdictionDocumentsDir } from "@/lib/scraper/downloadDocuments";
import { visitAgendaPdfPages } from "@/lib/scraper/agendaAttachments";
import { filterMeetingsToWindow, getMeetingWindow } from "@/lib/utils/meetingWindow";
import { parseMeetingDate } from "@/lib/utils/date";

/**
 * The City of Guadalupe publishes council records as WordPress "lsvrdocument"
 * posts. The site's own Council Agendas and Council Minutes pages are tables
 * over these posts, so the REST API is the same official inventory, one PDF per
 * post. Council records live under "City Council Agendas" (9), the older
 * "Council Agendas" (35) and "Council Minutes" (17).
 */
export const GUADALUPE_COUNCIL_CATEGORY_IDS = [9, 35, 17];
const OFFICIAL_HOSTS = new Set(["cityofguadalupe.org", "www.cityofguadalupe.org"]);
const MAX_PDF_BYTES = 100 * 1024 * 1024;

export type GuadalupeDocumentPost = {
  id: number;
  date: string;
  link?: string;
  title: { rendered: string };
  categories?: number[];
  meta_box?: { city_file_upload?: Array<{ url?: string; name?: string }> | null } | null;
};

function decodeHtml(value: string) {
  return value.replace(/&#x([\da-f]+);|&#(\d+);|&(nbsp|amp|quot|apos|lt|gt);/gi,
    (entity, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (decimal) return String.fromCodePoint(Number(decimal));
      return ({ nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" })[(named || "").toLowerCase()] || entity;
    }).replace(/\s+/g, " ").trim();
}

function isOfficialUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && OFFICIAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

type Classified = {
  date: string;
  kind: "regular" | "special";
  type: DocumentType;
  label: string;
  url: string;
  specialTitle?: string;
};

/** Map one official document post to its meeting date, meeting kind and document role. */
export function classifyGuadalupeDocument(post: GuadalupeDocumentPost): Classified | null {
  const title = decodeHtml(post.title.rendered);
  const file = post.meta_box?.city_file_upload?.find((upload) => upload.url && isOfficialUrl(upload.url));
  if (!file?.url) return null;
  // Oversight Board and Recreation Commission records share a category with council records.
  if (/oversight board|recreation (?:and parks )?commission/i.test(title) && !/\bCC\b|city council/i.test(title)) {
    return null;
  }
  const dateMatch = title.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  if (!dateMatch) return null;
  const [, month, day, year] = dateMatch;
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const special = /\bspecial\b/i.test(title);
  const kind = special ? "special" as const : "regular" as const;
  const specialTitle = special
    ? /closed session/i.test(title) ? "City Council Special Closed Session Meeting" : "City Council Special Meeting"
    : undefined;
  const isPdf = /\.pdf(?:$|\?)/i.test(file.url);

  let type: DocumentType;
  if (/^CC Minutes\b/i.test(title)) type = "Minutes";
  // Only the notice itself ("CC Agenda 12-23-2025 – Cancelled"), never an item
  // about cancelling some other meeting ("(Item 6D) Cancellation of ...").
  else if (/^CC Agendas? \d{1,2}-\d{1,2}-\d{4}\s*[–—-]?\s*(?:Notice of\s+)?Cancel/i.test(title) && !/\bitem\b/i.test(title)) {
    type = "Notice of Cancellation";
  }
  else if (/^CC Agendas? .*\bPacket\b/i.test(title)) type = "Agenda Packet";
  else if (/^CC Agendas? .*\bLinks\b/i.test(title)) type = "Agenda";
  else if (/^CC Agendas? \d{1,2}-\d{1,2}-\d{4}\b/i.test(title) && isPdf && !/\bitem\b/i.test(title)) type = "Agenda";
  else if (/items distributed|public comments?/i.test(title)) type = "Public Comment";
  else type = "Attachment";

  return { date, kind, type, label: title, url: file.url, specialTitle };
}

function displayDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${month}/${day}/${year}`;
}

/** Group official document posts into council meetings keyed by date and meeting kind. */
export function buildGuadalupeMeetings(posts: GuadalupeDocumentPost[], source: string, now = Date.now()): PrimeGovMeeting[] {
  const classified = posts.flatMap((post) => {
    const entry = classifyGuadalupeDocument(post);
    return entry ? [entry] : [];
  });
  // Agendas and cancellation notices define meetings. Minutes and supporting
  // documents rarely say which same-day meeting they belong to.
  const meetingKeys = new Set(classified
    .filter((entry) => ["Agenda", "Agenda Packet", "Notice of Cancellation"].includes(entry.type))
    .map((entry) => `${entry.date}|${entry.kind}`));
  const meetings = new Map<string, PrimeGovMeeting>();

  for (const entry of classified) {
    let key = `${entry.date}|${entry.kind}`;
    if (!meetingKeys.has(key)) {
      const sameDay = [...meetingKeys].find((candidate) => candidate.startsWith(`${entry.date}|`));
      if (sameDay) key = sameDay;
      else if (entry.type === "Minutes") meetingKeys.add(key);
      else continue;
    }
    let meeting = meetings.get(key);
    if (!meeting) {
      const [date, kind] = key.split("|");
      const title = kind === "special" ? entry.specialTitle || "City Council Special Meeting" : "City Council Regular Meeting";
      const midday = parseMeetingDate(`${displayDate(date)} 11:59 PM`);
      const upcoming = midday ? new Date(midday).getTime() >= now : false;
      meeting = {
        externalId: `guadalupe-${date}-${kind}`,
        section: upcoming ? "Current And Upcoming Meetings" : "Archived Meetings",
        title,
        dateText: displayDate(date),
        timeText: null,
        meetingType: title,
        bodyName: "City Council",
        rowText: `${title} ${displayDate(date)}`,
        status: upcoming ? "Upcoming" : "Past",
        sourceType: "Official Website",
        source,
        sourceUrl: source,
        sectionUrl: source,
        meetingDetailsUrl: source,
        hasHtmlAgenda: false,
        hasPdf: false,
        documents: [],
        items: []
      };
      meetings.set(key, meeting);
    }
    if (entry.specialTitle && meeting.title === "City Council Special Meeting") {
      meeting.title = entry.specialTitle;
      meeting.meetingType = entry.specialTitle;
    }
    if (entry.type === "Notice of Cancellation") {
      meeting.status = "Cancelled";
      meeting.section = "Archived Meetings";
    }
    if (!meeting.documents.some((document) => document.url === entry.url)) {
      meeting.documents.push({ type: entry.type, label: entry.label, url: entry.url });
    }
  }

  for (const meeting of meetings.values()) {
    meeting.hasPdf = meeting.documents.some((document) => /\.pdf(?:$|\?)/i.test(document.url));
    const agenda = meeting.documents.find((document) => document.type === "Agenda")
      || meeting.documents.find((document) => document.type === "Notice of Cancellation");
    if (agenda) {
      meeting.sourceUrl = agenda.url;
      meeting.meetingDetailsUrl = agenda.url;
    }
  }
  return Array.from(meetings.values()).sort((a, b) =>
    String(b.externalId).localeCompare(String(a.externalId)));
}

const PAGE_HEADER = /^.*City of Guadalupe Council Meeting Agenda Page \d+ of \d+\s*$/i;
const BODY_END = /hereby certify|P?ROPOSED FUTURE CITY COUNCIL AGENDA ITEMS/i;
const SECTION_HEADINGS = [
  "MANAGEMENT REPORTS", "PUBLIC HEARING", "PUBLIC HEARINGS", "REGULAR BUSINESS", "NEW BUSINESS",
  "OLD BUSINESS", "CLOSED SESSION", "CLOSED SESSION AGENDA", "SPECIAL JOINT MEETING", "SUCCESSOR AGENCY",
  "CEREMONIAL CALENDAR", "PRESENTATION", "PRESENTATIONS", "CONSENT CALENDAR"
];
// The PDF text layer sometimes drops a heading's first glyph ("ANAGEMENT REPORTS").
function sectionHeading(line: string) {
  const text = line.replace(/\s+/g, " ").trim();
  if (!/^[A-Z][A-Z &/]+$/.test(text)) return null;
  return SECTION_HEADINGS.find((heading) => heading === text || heading.slice(1) === text) || null;
}

/** Items that are meeting procedure or information-only reports, never Council decisions. */
const PROCEDURAL_ITEM = /^(?:roll call|pledge of allegiance|moment of thanks|agenda review|community participation forum|future agenda items|announcements|adjournment|closed session announcements?|ceremonial calendar|presentations?\b)/i;
const INFORMATION_ONLY = /\(information only\)/i;
const NON_DECISION_SECTIONS = new Set(["MANAGEMENT REPORTS", "CEREMONIAL CALENDAR", "PRESENTATION", "PRESENTATIONS"]);
const CONSENT = /^consent calendar/i;
const CLOSED_SESSION = /^closed session(?: agenda)?\b/i;
const WAIVE_READING = /^waive the reading in full of all ordinances/i;

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

type RawItem = { number: string; lines: string[]; section: string | null; subItems: { letter: string; lines: string[] }[] };

function itemTitle(lines: string[]) {
  const titleLines: string[] = [];
  for (const line of lines) {
    if (/^(?:written report|recommendation|the following items|at this time|each person)\b/i.test(line)) break;
    titleLines.push(line);
    if (/[.:]$/.test(line) && titleLines.length > 0) break;
  }
  return titleLines.join(" ").replace(/\s+/g, " ").trim();
}

function recommendation(lines: string[]) {
  const text = lines.join("\n");
  return text.match(/Recommendation:\s*([\s\S]*)$/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
}

/**
 * Read the numbered agenda in the City's "CC Agenda ... - Links" PDF. Consent
 * and closed-session sub-items are separate Council actions; information-only
 * reports, ceremonial proclamations and procedure stay as section headings.
 * The trailing "Proposed Future City Council Agenda Items" page is excluded:
 * those are not on this meeting's agenda.
 */
/**
 * The PDF text layer ends real lines with a space but sometimes breaks a line
 * inside a word ("payment of warra" / "nts for the period"). Rejoin those.
 */
const COMMON_SHORT_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "for", "has", "in", "is", "it", "its",
  "may", "not", "of", "on", "or", "our", "per", "the", "to", "via", "was", "who", "all", "any", "but"
]);

/** Was a line break inside a word ("warra" / "nts", "Proje" / "ct", "4" / "th")? */
export function isMidWordBreak(previous: string, next: string) {
  if (!/\S$/.test(previous)) return false; // real line ends carry a trailing space
  if (/^\.\s/.test(next)) return true; // "F" / ". Adopt Resolution"
  if (/^[a-z][.)]/.test(next)) return false; // "a. Receive a presentation"
  if (/-$/.test(previous) && /^[a-z]/.test(next)) return true;
  if (/\d$/.test(previous) && /^(?:st|nd|rd|th)\b/.test(next)) return true;
  if (!/^[a-z]/.test(next)) return false;
  const head = previous.match(/[A-Za-z]+$/)?.[0];
  const tail = next.match(/^[a-z]+/)?.[0] || "";
  if (!head) return false;
  // A lone letter with no trailing space was always a split word in the City's PDFs ("a" / "genda").
  const headFragment = head.length === 1 || (head.length <= 3 && !COMMON_SHORT_WORDS.has(head.toLowerCase()));
  const tailFragment = tail.length <= 3 && !COMMON_SHORT_WORDS.has(tail);
  return headFragment || tailFragment;
}

export function guadalupeAgendaLines(text: string) {
  const merged: string[] = [];
  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && isMidWordBreak(previous, rawLine)) {
      merged[merged.length - 1] = previous + rawLine;
    } else {
      merged.push(rawLine);
    }
  }
  return merged.map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !PAGE_HEADER.test(line));
}

export function parseGuadalupeAgendaItems(text: string, sourceUrl: string, meetingId: string): AgendaItem[] | null {
  const lines = guadalupeAgendaLines(text);
  const start = lines.findIndex((line) => /^1\.(?:\s|$|[A-Z])/.test(line));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && BODY_END.test(line));
  const body = lines.slice(start, end < 0 ? undefined : end);

  const raw: RawItem[] = [];
  let section: string | null = null;
  for (let index = 0; index < body.length; index += 1) {
    const line = body[index];
    const numbered = line.match(/^(\d{1,2})\.\s*(.*)$/);
    if (numbered && Number(numbered[1]) === raw.length + 1) {
      let first = numbered[2].trim();
      // "9." is sometimes on its own line with the title on the next one.
      if (!first && index + 1 < body.length) first = body[++index];
      raw.push({ number: numbered[1], lines: [first], section, subItems: [] });
      continue;
    }
    const heading = sectionHeading(line);
    if (heading) {
      section = heading;
      continue;
    }
    const current = raw[raw.length - 1];
    if (!current) continue;
    const lettered = line.match(/^([A-Z])\.\s*([A-Z0-9“"(].*)$/);
    const expected = String.fromCharCode(65 + current.subItems.length);
    if (lettered && lettered[1] === expected) {
      current.subItems.push({ letter: lettered[1], lines: [lettered[2]] });
    } else if (current.subItems.length > 0) {
      current.subItems[current.subItems.length - 1].lines.push(line);
    } else {
      current.lines.push(line);
    }
  }
  if (raw.length < 3) return null;

  const items: AgendaItem[] = [];
  for (const entry of raw) {
    const title = itemTitle(entry.lines);
    const block = [...entry.lines, ...entry.subItems.map((sub) => `${sub.letter}. ${sub.lines.join(" ")}`)].join("\n");
    const consent = CONSENT.test(title);
    const range = title.match(/\(A\s*[-–]\s*([A-Z])\)/i)?.[1];
    if (consent && range && entry.subItems.length !== range.toUpperCase().charCodeAt(0) - 64) {
      return null;
    }
    // Only consent and closed-session lists hold separate actions. Elsewhere a
    // lettered list is the steps of one recommendation ("A. Receive a presentation").
    const splitSubItems = entry.subItems.length > 0 && (consent || CLOSED_SESSION.test(title));
    const heading = splitSubItems || PROCEDURAL_ITEM.test(title) || INFORMATION_ONLY.test(title) ||
      NON_DECISION_SECTIONS.has(entry.section || "");
    items.push({
      externalId: `guadalupe-${meetingId}-item-${entry.number}`,
      fileNumber: null,
      agendaNumber: entry.number,
      itemType: heading ? "Section Heading" : entry.section ? titleCase(entry.section) : null,
      title,
      action: null,
      result: null,
      sourceUrl,
      rowText: block,
      meetingBody: "City Council",
      recommendedAction: heading ? null : recommendation(block.split("\n"))
    });
    if (!splitSubItems) continue;
    const parentLabel = consent ? "Consent Calendar" : "Closed Session";
    for (const sub of entry.subItems) {
      const subText = sub.lines.join(" ").replace(/\s+/g, " ").trim();
      if (WAIVE_READING.test(subText)) continue;
      items.push({
        externalId: `guadalupe-${meetingId}-item-${entry.number}-${sub.letter.toLowerCase()}`,
        fileNumber: null,
        agendaNumber: `${entry.number}.${sub.letter}`,
        itemType: parentLabel,
        title: subText,
        action: null,
        result: null,
        sourceUrl,
        rowText: `${entry.number}.${sub.letter}. ${subText}`,
        meetingBody: "City Council",
        recommendedAction: consent ? subText : null
      });
    }
  }
  return items;
}

/** The agenda header states the start time and place: "Tuesday, November 10, 2026, at 6:00 p.m.". */
export function parseGuadalupeAgendaHeader(text: string) {
  const fullHeader = text.slice(0, 1500).replace(/\s+/g, " ");
  // Stop before the written-comment deadline ("no later than 2:00 p.m.").
  const header = fullHeader.split(/If you choose not to attend|Please be advised/i)[0];
  // A special session "following the regular meeting" has no fixed start time.
  const time = /following the city council regular meeting/i.test(header)
    ? null
    : header.match(new RegExp(`\\d{4},? at (\\d{1,2}:\\d{2}) ?([ap])\\.? ?m\\.?`, "i"));
  const lines = guadalupeAgendaLines(text.slice(0, 2000));
  const when = lines.findIndex((line) => /\d{4},? at \d|following the city council regular meeting/i.test(line));
  const afterWhen = lines.slice(when + 1, when + 3)
    .find((line) => /\d{2,5} [A-Z][a-z]+ (?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?)\b/.test(line));
  return {
    timeText: time ? `${time[1]} ${time[2].toUpperCase()}M` : null,
    location: when >= 0 && afterWhen ? afterWhen : null
  };
}

/**
 * The "Links" agenda links each item to its own staff report, named by item
 * number: "6E.-Authorizing-City-Administrator....pdf", "10.-Amendments-to....pdf".
 */
export function guadalupeAttachmentItemNumber(url: string) {
  let name: string;
  try {
    name = decodeURIComponent(path.posix.basename(new URL(url).pathname));
  } catch {
    return null;
  }
  const match = name.match(/^(\d{1,2})([A-Z])?\.?[-_ ]/);
  if (!match) return null;
  return match[2] ? `${match[1]}.${match[2]}` : match[1];
}

function attachmentLabel(url: string) {
  const name = decodeURIComponent(path.posix.basename(new URL(url).pathname)).replace(/\.pdf$/i, "");
  return name.replace(/^(\d{1,2}[A-Z]?)\.?-/, "$1. ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

export function guadalupeItemAttachmentDocuments(linkUrls: string[], agendaUrl: string): PrimeGovDocument[] {
  const seen = new Set<string>();
  const documents: PrimeGovDocument[] = [];
  for (const url of linkUrls) {
    if (!isOfficialUrl(url) || !/\.pdf(?:$|\?)/i.test(url) || seen.has(url)) continue;
    const agendaItemNumber = guadalupeAttachmentItemNumber(url);
    if (!agendaItemNumber) continue;
    seen.add(url);
    documents.push({
      // Never "Minutes": a linked copy of last meeting's minutes is this item's backup.
      type: "Staff Report",
      label: attachmentLabel(url),
      url,
      parentDocumentUrl: agendaUrl,
      agendaItemNumber,
      isAgendaItemAttachment: true
    });
  }
  return documents;
}

function attachItemDocuments(meeting: PrimeGovMeeting, items: AgendaItem[]) {
  const byNumber = new Map(items.map((item) => [item.agendaNumber, item]));
  for (const document of meeting.documents) {
    if (!document.isAgendaItemAttachment || !document.agendaItemNumber) continue;
    // Information-only reports ("7B.") are folded into their parent item.
    const item = byNumber.get(document.agendaItemNumber) || byNumber.get(document.agendaItemNumber.split(".")[0]);
    if (!item) continue;
    document.agendaItemTitle = item.title;
    item.attachments = [...(item.attachments || []), document];
  }
}

export function enrichGuadalupeMeetings(meetings: PrimeGovMeeting[], log: (message: string) => void = () => undefined) {
  let count = 0;
  for (const meeting of meetings) {
    const agenda = meeting.documents.find((document) => document.type === "Agenda");
    const notice = meeting.documents.find((document) => document.type === "Notice of Cancellation");
    const headerSource = agenda?.extractedText || notice?.extractedText;
    if (headerSource) {
      const header = parseGuadalupeAgendaHeader(headerSource);
      if (header.timeText) meeting.timeText = header.timeText;
      if (header.location) meeting.location = header.location;
      if (/NOTICE OF CANCELLATION/.test(headerSource) && /has been cancell?ed/i.test(headerSource)) {
        meeting.status = "Cancelled";
      }
    }
    if (!agenda?.extractedText || meeting.status === "Cancelled") continue;
    const items = parseGuadalupeAgendaItems(agenda.extractedText, agenda.url,
      meeting.externalId?.replace(/^guadalupe-/, "") || "unknown");
    if (items && items.length > 0) {
      attachItemDocuments(meeting, items);
      meeting.items = items;
      meeting.agendaItemInventoryComplete = true;
      count += items.length;
    } else {
      meeting.extractionNotes = [...(meeting.extractionNotes || []),
        "Guadalupe agenda numbering could not be verified; using generic agenda text extraction."];
      log(`Guadalupe agenda numbering could not be verified for ${meeting.title} ${meeting.dateText}.`);
    }
  }
  return count;
}

async function fetchWithRetry(url: string, timeoutMs: number) {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "Mozilla/5.0 SimpleCity civic agenda scraper" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      failure = error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`Guadalupe official source failed: ${url}`, { cause: failure });
}

async function fetchDocumentPosts(afterIso: string) {
  const posts: GuadalupeDocumentPost[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = new URL("https://cityofguadalupe.org/wp-json/wp/v2/lsvrdocument");
    url.searchParams.set("categories", GUADALUPE_COUNCIL_CATEGORY_IDS.join(","));
    url.searchParams.set("after", afterIso);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("_fields", "id,date,link,title,categories,meta_box");
    const response = await fetchWithRetry(url.toString(), 30_000);
    const batch = await response.json() as GuadalupeDocumentPost[];
    if (!Array.isArray(batch)) throw new Error("Guadalupe document API returned an unexpected payload.");
    posts.push(...batch);
    const totalPages = Number(response.headers.get("x-wp-totalpages") || "1");
    if (page >= totalPages || batch.length === 0) break;
  }
  return posts;
}

async function downloadPdf(document: PrimeGovDocument, target: string) {
  if (!isOfficialUrl(document.url)) throw new Error(`Refusing non-official Guadalupe URL ${document.url}`);
  const response = await fetchWithRetry(document.url, 120_000);
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > MAX_PDF_BYTES) throw new Error(`Guadalupe document is too large (${declared} bytes).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("Guadalupe document was not a usable PDF.");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, target);
}

export async function scrapeGuadalupeMeetings(options: ScrapePortalOptions & { jurisdiction: JurisdictionConfig }): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const source = options.portalUrl || options.jurisdiction.sourceUrl;
  const window = getMeetingWindow(options);
  // Posts go up a few days before a meeting and minutes weeks after it.
  const after = new Date(window.start - 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
  const posts = await fetchDocumentPosts(after);
  const meetings = filterMeetingsToWindow(buildGuadalupeMeetings(posts, source), options);
  const selected = typeof options.limit === "number" ? meetings.slice(0, options.limit) : meetings;
  log(`Guadalupe official document library yielded ${posts.length} post(s) and ${selected.length} council meeting(s) in the window.`);
  if (selected.length === 0) throw new Error("Guadalupe scraper found zero council meetings in the configured window.");

  const documentDir = options.documentOutputDir || getJurisdictionDocumentsDir("guadalupe");
  const download = async (meeting: PrimeGovMeeting, document: PrimeGovDocument) => {
    if (!/\.pdf(?:$|\?)/i.test(document.url)) return;
    const name = path.basename(new URL(document.url).pathname).replace(/[^\w.-]+/g, "-");
    const target = path.join(documentDir, `${meeting.externalId}-${name}`);
    try {
      await downloadPdf(document, target);
      document.localPath = target;
    } catch (error) {
      document.downloadError = error instanceof Error ? error.message : String(error);
      log(`Guadalupe document download failed for ${document.url}: ${document.downloadError}`);
    }
  };
  if (options.downloadDocuments !== false) {
    let attachmentCount = 0;
    for (const meeting of selected) {
      for (const document of [...meeting.documents]) {
        if (options.shouldStop?.()) break;
        await download(meeting, document);
      }
      const agenda = meeting.documents.find((document) => document.type === "Agenda" && document.localPath);
      if (!agenda?.localPath || options.shouldStop?.()) continue;
      const linkUrls: string[] = [];
      try {
        await visitAgendaPdfPages(agenda.localPath, (page) => {
          for (const link of page.links) if (link.url) linkUrls.push(link.url);
        });
      } catch (error) {
        log(`Guadalupe agenda links could not be read for ${meeting.dateText}: ${error instanceof Error ? error.message : error}`);
      }
      const known = new Set(meeting.documents.map((document) => document.url));
      for (const attachment of guadalupeItemAttachmentDocuments(linkUrls, agenda.url)) {
        if (known.has(attachment.url) || options.shouldStop?.()) continue;
        meeting.documents.push(attachment);
        await download(meeting, attachment);
        attachmentCount += 1;
      }
    }
    log(`Guadalupe agenda links yielded ${attachmentCount} item staff report(s).`);
  }
  const upcoming = selected.filter((meeting) => meeting.status === "Upcoming").length;
  return {
    source,
    scrapedAt: new Date().toISOString(),
    totalMeetingCount: selected.length,
    currentAndUpcomingCount: upcoming,
    archivedCount: selected.length - upcoming,
    meetings: selected
  };
}
