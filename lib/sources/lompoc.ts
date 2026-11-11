import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type { AgendaItem, PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { getJurisdictionDocumentsDir } from "@/lib/scraper/downloadDocuments";
import { filterMeetingsToWindow, getMeetingWindow } from "@/lib/utils/meetingWindow";
import { parseMeetingDate } from "@/lib/utils/date";

const runFile = promisify(execFile);
const helperPath = path.join(process.cwd(), "scripts", "lompoc_fetch.py");

async function fetchLompocSource(kind: "html" | "pdf", url: string, output?: string) {
  const python = process.env.LOMPOC_PYTHON || "python3";
  try {
    const result = await runFile(python, [helperPath, kind, url, ...(output ? [output] : [])], {
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024
    });
    return result.stdout;
  } catch (error) {
    throw new Error(`Could not fetch Lompoc official ${kind} source at ${url}. Install curl_cffi==0.13.0 for the pipeline.`, { cause: error });
  }
}

function decodeHtml(value: string) {
  return value.replace(/&#x([\da-f]+);|&#(\d+);|&(nbsp|amp|quot|apos|lt|gt);/gi,
    (entity, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (decimal) return String.fromCodePoint(Number(decimal));
      return ({ nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" })[(named || "").toLowerCase()] || entity;
    });
}

function htmlText(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function hrefFromCell(cell: string) {
  const anchor = cell.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return anchor?.[1] || null;
}

/** Read the current official City Council calendar table, including document links. */
export function parseLompocCouncilRows(html: string, source: string): PrimeGovMeeting[] {
  const rows: PrimeGovMeeting[] = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi), (cell) => cell[1]);
    if (cells.length < 4 || !/event_title/i.test(match[1]) || !/event_datetime/i.test(match[1])) continue;
    const eventHref = hrefFromCell(cells[0]);
    const eventId = eventHref?.match(/\/Event\/(\d+)\//i)?.[1];
    const dateTime = htmlText(cells[1]).match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (!eventHref || !eventId || !dateTime) continue;
    const agendaHref = hrefFromCell(cells[2]);
    const minutesHref = hrefFromCell(cells[3]);
    const title = htmlText(cells[0]);
    const startsAt = parseMeetingDate(`${dateTime[1]} ${dateTime[2]}`);
    const status = startsAt && new Date(startsAt).getTime() >= Date.now() ? "Upcoming" : "Past";
    const detailsUrl = new URL(eventHref, source).toString();
    rows.push({
      externalId: `lompoc-calendar-${eventId}`,
      section: status === "Upcoming" ? "Current And Upcoming Meetings" : "Archived Meetings",
      title,
      dateText: dateTime[1],
      timeText: dateTime[2],
      meetingType: title,
      bodyName: "City Council",
      rowText: `${title} ${dateTime[1]} ${dateTime[2]}`,
      status,
      source,
      sourceUrl: detailsUrl,
      sectionUrl: source,
      meetingDetailsUrl: detailsUrl,
      hasHtmlAgenda: false,
      hasPdf: Boolean(agendaHref),
      documents: [
        ...(agendaHref ? [{ type: "Agenda" as const, label: htmlText(cells[2]), url: new URL(agendaHref, source).toString() }] : []),
        ...(minutesHref ? [{ type: "Minutes" as const, label: htmlText(cells[3]), url: new URL(minutesHref, source).toString() }] : [])
      ]
    });
  }
  return rows;
}

/** The city's PDF numbers action items consecutively, even across page breaks. */
export function parseLompocAgendaItems(text: string, sourceUrl: string, meetingId: string): AgendaItem[] {
  const numberedLines = Array.from(text.matchAll(/^(\d{1,2})\.\s+(.+)$/gm));
  const firstItem = numberedLines.findIndex((match) => match[1] === "1");
  if (firstItem < 0) return [];
  const matches = numberedLines.slice(firstItem);
  return matches.map((match, index) => {
    const number = match[1];
    const block = text.slice(match.index, matches[index + 1]?.index ?? text.length)
      .split(/\n\s*(?=[A-Z][A-Z /()'-]{4,}:)/)[0].trim();
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const titleLines: string[] = [match[2].trim()];
    for (const line of lines.slice(1, 6)) {
      if (/^(?:Recommendation:|[A-Za-z_.-]+@[A-Za-z_.-]+)/.test(line)) break;
      if (/[.:]$/.test(titleLines[titleLines.length - 1])) break;
      titleLines.push(line);
    }
    const title = titleLines.join(" ").replace(/\s+/g, " ").trim();
    return {
      externalId: `lompoc-${meetingId}-item-${number}`,
      fileNumber: null,
      agendaNumber: number,
      itemType: null,
      title,
      action: null,
      result: null,
      sourceUrl,
      rowText: block,
      meetingBody: "City Council",
      recommendedAction: block.match(/Recommendation:\s*([\s\S]*?)(?=\n\s*\(|$)/i)?.[1]?.replace(/\s+/g, " ").trim() || null
    };
  });
}

export function enrichLompocAgendaItems(meetings: PrimeGovMeeting[]) {
  let count = 0;
  for (const meeting of meetings) {
    const agenda = meeting.documents.find((document) => document.type === "Agenda");
    if (!agenda?.extractedText) continue;
    const items = parseLompocAgendaItems(agenda.extractedText, agenda.url,
      meeting.externalId?.replace(/^.*-/, "") || "unknown");
    if (items.length > 0 && items.every((item, index) => Number(item.agendaNumber) === index + 1)) {
      meeting.items = items;
      meeting.agendaItemInventoryComplete = true;
      count += items.length;
    }
  }
  return count;
}

export async function scrapeLompocMeetings(options: ScrapePortalOptions & { jurisdiction: JurisdictionConfig }): Promise<ScrapePortalResult> {
  const source = options.portalUrl || options.jurisdiction.sourceUrl;
  const window = getMeetingWindow(options);
  const discovered = new Map<string, PrimeGovMeeting>();
  for (let page = 1; page <= 10; page += 1) {
    if (options.shouldStop?.()) break;
    const pageUrl = page === 1 ? source : `${source.replace(/\/$/, "")}/-npage-${page}`;
    const rows = parseLompocCouncilRows(await fetchLompocSource("html", pageUrl), source);
    if (rows.length === 0) break;
    for (const row of rows) discovered.set(row.externalId || row.sourceUrl || "", row);
    const oldest = rows[rows.length - 1];
    const oldestDate = parseMeetingDate(`${oldest.dateText} ${oldest.timeText}`);
    if (oldestDate && new Date(oldestDate).getTime() < window.start) break;
  }
  const inWindow = filterMeetingsToWindow(Array.from(discovered.values()), options);
  const selected = typeof options.limit === "number" ? inWindow.slice(0, options.limit) : inWindow;
  const documentDir = options.documentOutputDir || getJurisdictionDocumentsDir("lompoc");
  if (options.downloadDocuments !== false) {
    for (const meeting of selected) {
      if (options.shouldStop?.()) break;
      for (const document of meeting.documents) {
        const documentId = document.url.match(/showpublisheddocument\/(\d+)/i)?.[1] || "unknown";
        const target = path.join(documentDir, `${meeting.externalId}-${document.type.toLowerCase()}-${documentId}.pdf`);
        await fetchLompocSource("pdf", document.url, target);
        document.localPath = target;
      }
    }
  }
  const upcoming = selected.filter((meeting) => meeting.status === "Upcoming").length;
  options.log?.(`Lompoc official calendar yielded ${selected.length} meeting(s) and ${selected.flatMap((meeting) => meeting.documents).length} linked document(s).`);
  return {
    source,
    scrapedAt: new Date().toISOString(),
    totalMeetingCount: selected.length,
    currentAndUpcomingCount: upcoming,
    archivedCount: selected.length - upcoming,
    meetings: selected
  };
}
