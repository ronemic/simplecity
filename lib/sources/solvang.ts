import fs from "node:fs/promises";
import path from "node:path";
import type { AgendaItem, PrimeGovDocument, PrimeGovMeeting } from "@/lib/types";
import { getJurisdictionDocumentsDir } from "@/lib/scraper/downloadDocuments";

/**
 * Solvang's PrimeGov HTML agenda is a sequence of table rows: numbered rows
 * are sections ("6. CONSENT ITEMS"), lettered rows beneath them are the items
 * the Council acts on ("c. Approve October Warrants"), and each row carries its
 * own staff report and attachment links. The generic agenda-text extractor only
 * sees the numbered sections, so this reads the rows directly.
 */
const OFFICIAL_HOST = "cityofsolvang.primegov.com";
const MAX_ATTACHMENT_BYTES = 60 * 1024 * 1024;

function decodeHtml(value: string) {
  return value.replace(/&#x([\da-f]+);|&#(\d+);|&(nbsp|amp|quot|apos|lt|gt|rsquo|lsquo|ldquo|rdquo|ndash|mdash);/gi,
    (entity, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (decimal) return String.fromCodePoint(Number(decimal));
      return ({
        nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", rsquo: "’", lsquo: "‘",
        ldquo: "“", rdquo: "”", ndash: "–", mdash: "—"
      })[(named || "").toLowerCase()] || entity;
    });
}

function text(html: string) {
  return decodeHtml(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

type Row = {
  label: string;
  title: string;
  description: string;
  attachments: { label: string; url: string }[];
};

/** Read numbered and lettered agenda rows in document order. */
export function solvangAgendaRows(html: string, pageUrl: string): Row[] {
  const rows: Row[] = [];
  const page = html.replace(/data:image\/[^"']+/g, "");
  for (const match of page.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(match[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi),
      (cell) => ({ attrs: cell[1], body: cell[2] }))
      .filter((cell) => !/attachmentCell|optionalButtonsCell/.test(cell.attrs));
    const labelCell = cells.find((cell) => text(cell.body));
    const label = labelCell ? text(labelCell.body) : "";
    if (!/^(?:\d{1,2}|[a-z])\.$/.test(label)) continue;
    const titleCell = cells[cells.indexOf(labelCell!) + 1];
    if (!titleCell) continue;
    const content = titleCell.body.split(/<div class="item_contents"/i)[0];
    const paragraphs = Array.from(content.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi), (paragraph) => text(paragraph[1]))
      .filter(Boolean);
    const title = paragraphs[0] || text(content);
    if (!title) continue;
    const attachments = Array.from(titleCell.body.matchAll(
      /<a\b[^>]*href="([^"]*historyattachment\/\?historyId=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    ), (anchor) => {
      const titleAttr = anchor[0].match(/title="Download ([^"]+)"/i)?.[1];
      return { label: decodeHtml(titleAttr || text(anchor[2])).trim(), url: new URL(decodeHtml(anchor[1]), pageUrl).toString() };
    });
    rows.push({ label, title, description: paragraphs.slice(1).join(" "), attachments });
  }
  return rows;
}

/** Sections whose rows are ceremony, reports or procedure rather than Council decisions. */
const NON_DECISION_SECTION = /^(?:proclamations?|commendations?|presentations?|public communications?|city manager|gc section|council (?:closing )?comments|closing comments|adjourn|roll call|call to order|pledge|public comments?|announcement|recess|reconvene|report out|preliminary matters|ex parte|city staff comments|staff comments|committee member comments|planning commissioners'? comments|commissioners'? comments|[a-z ]+ director(?:'s)? report)/i;
/** Section names that hold the lettered items; an empty one is still only a heading. */
const SECTION_NAME = /^(?:consent (?:items|calendar)|discussion items|public hearings?|new business|old business|unfinished business|business items|action items)[:.]?$/i;
const PROCEDURAL_ITEM = /^(?:approve (?:the )?order of (?:the )?agenda|public communications? on closed session|recess to closed session|announcement of closed session actions?|adjourn)/i;

function titleCase(value: string) {
  return value.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

function sectionName(title: string) {
  return titleCase(title.replace(/[:.]+$/, "").trim());
}

/**
 * Numbering restarts at 1 within one agenda: a combined "Special Closed and
 * Regular Meeting" numbers each meeting from 1, and two 2026 agendas restart
 * again at "1. PUBLIC HEARINGS". Split the agenda into consecutively numbered parts.
 */
function agendaParts(rows: Row[]) {
  const parts: Row[][] = [[]];
  for (const row of rows) {
    if (row.label === "1." && parts[parts.length - 1].length > 0) parts.push([]);
    parts[parts.length - 1].push(row);
  }
  return parts;
}

export function parseSolvangAgendaItems(html: string, pageUrl: string, meetingId: string): AgendaItem[] | null {
  const rows = solvangAgendaRows(html, pageUrl);
  if (rows.length === 0) return null;
  const parts = agendaParts(rows);
  const items: AgendaItem[] = [];
  let openPartSeen = false;
  for (const [index, part] of parts.entries()) {
    const isClosed = parts.length > 1 && part.some((row) => /closed session/i.test(row.title)) &&
      !part.some((row) => /consent|discussion|public hearing/i.test(row.title));
    // Closed-session parts read "CS 2.a". A later open part keeps the official
    // numbers and only needs a distinct source ID.
    const prefix = isClosed ? "CS " : "";
    const idPrefix = isClosed ? "cs-" : openPartSeen ? `p${index + 1}-` : "";
    if (!isClosed) openPartSeen = true;
    const partItems = parseAgendaPart(part, pageUrl, meetingId, prefix, idPrefix);
    if (!partItems) return null;
    items.push(...partItems);
  }
  return items;
}

function parseAgendaPart(rows: Row[], pageUrl: string, meetingId: string, prefix: string, idPrefix: string): AgendaItem[] | null {
  const items: AgendaItem[] = [];
  let section: { number: string; title: string; item: AgendaItem } | null = null;
  let expectedNumber = 1;
  let expectedLetter = 0;

  for (const row of rows) {
    const document = (attachment: Row["attachments"][number], agendaItemNumber: string, agendaItemTitle: string): PrimeGovDocument => ({
      type: /^staff report$/i.test(attachment.label) ? "Staff Report" : "Attachment",
      label: attachment.label,
      url: attachment.url,
      parentDocumentUrl: pageUrl,
      agendaItemNumber,
      agendaItemTitle,
      isAgendaItemAttachment: true
    });

    if (/^\d/.test(row.label)) {
      const number = row.label.replace(".", "");
      // Rows are numbered consecutively; anything else means the layout was misread.
      if (Number(number) !== expectedNumber) return null;
      expectedNumber += 1;
      expectedLetter = 0;
      const item: AgendaItem = {
        externalId: `solvang-${meetingId}-item-${idPrefix}${number}`,
        fileNumber: null,
        agendaNumber: `${prefix}${number}`,
        itemType: NON_DECISION_SECTION.test(row.title) || PROCEDURAL_ITEM.test(row.title) || SECTION_NAME.test(row.title)
          ? "Section Heading" : null,
        title: row.title,
        action: null,
        result: null,
        sourceUrl: pageUrl,
        rowText: [row.title, row.description].filter(Boolean).join("\n"),
        meetingBody: null,
        recommendedAction: null,
        attachments: []
      };
      item.attachments = row.attachments.map((attachment) => document(attachment, item.agendaNumber || number, row.title));
      section = { number, title: row.title, item };
      items.push(item);
      continue;
    }

    if (!section) return null;
    if (row.label.charCodeAt(0) - 97 !== expectedLetter) return null;
    expectedLetter += 1;
    // A section that has lettered items is a heading, not an action.
    section.item.itemType = "Section Heading";
    const agendaNumber = `${prefix}${section.number}.${row.label.replace(".", "")}`;
    const closedSession = /closed session/i.test(section.title) && !/public communications?/i.test(section.title);
    const ceremonial = !closedSession && NON_DECISION_SECTION.test(section.title);
    items.push({
      externalId: `solvang-${meetingId}-item-${idPrefix}${section.number}-${row.label.replace(".", "")}`,
      fileNumber: null,
      agendaNumber,
      itemType: closedSession ? "Closed Session"
        : ceremonial || PROCEDURAL_ITEM.test(row.title) ? "Section Heading" : sectionName(section.title),
      title: row.title,
      action: null,
      result: null,
      sourceUrl: pageUrl,
      rowText: [`${agendaNumber}. ${row.title}`, row.description].filter(Boolean).join("\n"),
      meetingBody: null,
      recommendedAction: null,
      attachments: row.attachments.map((attachment) => document(attachment, agendaNumber, row.title))
    });
  }
  return items;
}

function isOfficialUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === OFFICIAL_HOST;
  } catch {
    return false;
  }
}

async function fetchOfficial(url: string, timeoutMs: number) {
  if (!isOfficialUrl(url)) throw new Error(`Refusing non-official Solvang URL ${url}`);
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "Mozilla/5.0 SimpleCity civic agenda scraper" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!isOfficialUrl(response.url)) throw new Error(`Redirected off the official host to ${response.url}`);
      return response;
    } catch (error) {
      failure = error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`Solvang official source failed: ${url}`, { cause: failure });
}

async function downloadAttachment(document: PrimeGovDocument, directory: string, meetingId: string) {
  const response = await fetchOfficial(document.url, 120_000);
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > MAX_ATTACHMENT_BYTES) throw new Error(`Attachment is too large (${declared} bytes).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  // Presentations and spreadsheets stay linked; only PDFs feed text extraction.
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return false;
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("Attachment is too large.");
  const id = new URL(document.url).searchParams.get("historyId") || "attachment";
  const target = path.join(directory, `solvang-${meetingId}-${id}.pdf`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(`${target}.tmp`, bytes);
  await fs.rename(`${target}.tmp`, target);
  document.localPath = target;
  return true;
}

function meetingIdFor(meeting: PrimeGovMeeting) {
  const agenda = meeting.documents.find((document) => document.type === "HTML Agenda");
  const templateId = agenda ? new URL(agenda.url).searchParams.get("meetingTemplateId") : null;
  return templateId || meeting.externalId || "unknown";
}

/** Replace the section-only item list with Solvang's real rows and their attachments. */
export async function enrichSolvangMeetings(meetings: PrimeGovMeeting[], options: {
  documentOutputDir?: string;
  downloadDocuments?: boolean;
  log?: (message: string) => void;
  shouldStop?: () => boolean;
} = {}) {
  const log = options.log || (() => undefined);
  const directory = options.documentOutputDir || getJurisdictionDocumentsDir("solvang");
  let itemCount = 0;
  let attachmentCount = 0;
  for (const meeting of meetings) {
    if (options.shouldStop?.()) break;
    const agenda = meeting.documents.find((document) => document.type === "HTML Agenda");
    if (!agenda || !isOfficialUrl(agenda.url) || meeting.status === "Cancelled") continue;
    let items: AgendaItem[] | null = null;
    try {
      const html = await (await fetchOfficial(agenda.url, 45_000)).text();
      items = parseSolvangAgendaItems(html, agenda.url, meetingIdFor(meeting));
    } catch (error) {
      log(`Solvang agenda rows could not be read for ${meeting.title} ${meeting.dateText}: ${error instanceof Error ? error.message : error}`);
    }
    if (!items || items.length === 0) {
      meeting.extractionNotes = [...(meeting.extractionNotes || []),
        "Solvang agenda rows could not be verified; using generic agenda text extraction."];
      continue;
    }
    meeting.items = items;
    meeting.agendaItemInventoryComplete = true;
    itemCount += items.length;
    const known = new Set(meeting.documents.map((document) => document.url));
    for (const item of items) {
      for (const attachment of item.attachments || []) {
        if (known.has(attachment.url)) continue;
        known.add(attachment.url);
        meeting.documents.push(attachment);
        attachmentCount += 1;
        if (options.downloadDocuments === false || options.shouldStop?.()) continue;
        try {
          await downloadAttachment(attachment, directory, meetingIdFor(meeting));
        } catch (error) {
          attachment.downloadError = error instanceof Error ? error.message : String(error);
          log(`Solvang attachment download failed for ${attachment.label}: ${attachment.downloadError}`);
        }
      }
    }
  }
  log(`Solvang agenda rows yielded ${itemCount} item(s) and ${attachmentCount} attachment(s).`);
  return itemCount;
}
