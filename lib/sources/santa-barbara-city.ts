import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type { AgendaItem, PrimeGovMeeting, ScrapePortalResult } from "@/lib/types";
import type { ScrapePortalOptions } from "@/lib/scraper/primegov";
import { cleanText } from "@/lib/utils/slug";
import { filterMeetingsToWindow } from "@/lib/utils/meetingWindow";

type OnBaseMeeting = {
  ID: number;
  Name: string;
  MeetingTypeName: string;
  Time: string;
  TimeString: string;
  IsAgendaAvailable: boolean;
  IsMinutesAvailable: boolean;
};

/** The official OnBase home page embeds its meeting inventory in SearchResults. */
export function parseSantaBarbaraCityInventory(html: string): OnBaseMeeting[] {
  const marker = "new SearchResults({";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Santa Barbara city OnBase meeting inventory was not found.");
  const objectStart = start + marker.length - 1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = objectStart; index < html.length; index += 1) {
    const character = html[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && quoted) { escaped = true; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (character === "{") depth += 1;
    if (character === "}" && --depth === 0) {
      const payload = JSON.parse(html.slice(objectStart, index + 1)) as { Meetings?: OnBaseMeeting[] };
      if (!Array.isArray(payload.Meetings)) throw new Error("Santa Barbara city OnBase returned no meeting inventory.");
      return payload.Meetings;
    }
  }
  throw new Error("Santa Barbara city OnBase inventory is incomplete.");
}

function plainText(html: string) {
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, (entity) => ({
      "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&lt;": "<", "&gt;": ">"
    })[entity.toLowerCase()] || entity);
  return cleanText(text);
}

export function parseSantaBarbaraCityAgendaItems(html: string, sourceUrl: string, meetingId: string): AgendaItem[] {
  const paragraphs = Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi),
    (match) => plainText(match[1]));
  const items: AgendaItem[] = [];
  for (const paragraph of paragraphs) {
    const heading = paragraph.match(/^(\d+)\.\s*Subject:\s*(.+)$/i);
    if (heading) {
      items.push({
        externalId: `santa-barbara-city-onbase-${meetingId}-item-${heading[1]}`,
        fileNumber: null,
        agendaNumber: heading[1],
        itemType: null,
        title: heading[2],
        action: null,
        result: null,
        sourceUrl,
        rowText: paragraph,
        meetingBody: "City Council",
        recommendedAction: null
      });
    } else if (items.length > 0 && /^(?:Recommendation:|[A-Z]\.\s)/.test(paragraph)) {
      const item = items[items.length - 1];
      item.rowText = `${item.rowText}\n${paragraph}`;
      item.recommendedAction = [item.recommendedAction, paragraph].filter(Boolean).join("\n");
    }
  }
  return items;
}

async function fetchOfficialText(url: string) {
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      failure = error;
    }
  }
  throw new Error(`Santa Barbara city OnBase source failed: ${url}`, { cause: failure });
}

export async function scrapeSantaBarbaraCityMeetings(options: ScrapePortalOptions & { jurisdiction: JurisdictionConfig }): Promise<ScrapePortalResult> {
  const source = options.portalUrl || options.jurisdiction.sourceUrl;
  const inventory = parseSantaBarbaraCityInventory(await fetchOfficialText(source));
  const meetings = filterMeetingsToWindow(inventory.map((entry): PrimeGovMeeting => {
    const detailsUrl = new URL(`/OnBaseAgendaOnline/Meetings/ViewMeeting?id=${entry.ID}&doctype=1`, source).toString();
    const agendaUrl = new URL(`/OnBaseAgendaOnline/Documents/ViewAgenda?meetingId=${entry.ID}&type=agenda&doctype=1`, source).toString();
    const minutesUrl = new URL(`/OnBaseAgendaOnline/Documents/ViewAgenda?meetingId=${entry.ID}&type=minutes&doctype=2`, source).toString();
    const dateText = entry.TimeString?.split(" ").slice(0, 1).join("") || null;
    const timeText = entry.TimeString?.replace(/^\S+\s*/, "") || null;
    const status = /cancelled|canceled/i.test(`${entry.Name} ${entry.MeetingTypeName}`)
      ? "Cancelled" : new Date(entry.Time).getTime() >= Date.now() ? "Upcoming" : "Past";
    return {
      externalId: `santa-barbara-city-onbase-${entry.ID}`,
      section: status === "Upcoming" ? "Current And Upcoming Meetings" : "Archived Meetings",
      title: entry.Name,
      dateText, timeText,
      meetingType: entry.MeetingTypeName || entry.Name,
      bodyName: "City Council",
      rowText: `${entry.Name} ${entry.TimeString}`,
      status,
      source: source,
      sourceUrl: detailsUrl,
      sectionUrl: source,
      meetingDetailsUrl: detailsUrl,
      hasHtmlAgenda: false,
      hasPdf: false,
      documents: [
        ...(entry.IsAgendaAvailable ? [{ type: "Agenda" as const, label: "Agenda", url: agendaUrl }] : []),
        ...(entry.IsMinutesAvailable ? [{ type: "Minutes" as const, label: "Minutes", url: minutesUrl }] : [])
      ]
    };
  }), options);
  const selected = typeof options.limit === "number" ? meetings.slice(0, options.limit) : meetings;
  for (const meeting of selected) {
    if (options.shouldStop?.()) break;
    const agenda = meeting.documents.find((document) => document.type === "Agenda");
    if (!agenda) continue;
    const html = await fetchOfficialText(agenda.url);
    agenda.extractedText = plainText(html);
    agenda.extractionCharacterCount = agenda.extractedText.length;
    if (agenda.extractedText.length < 200) {
      throw new Error(`Santa Barbara city agenda is empty: ${agenda.url}`);
    }
    const items = parseSantaBarbaraCityAgendaItems(html, agenda.url,
      meeting.externalId?.replace(/^.*-/, "") || "unknown");
    if (items.length > 0 && items.every((item, index) => Number(item.agendaNumber) === index + 1)) {
      meeting.items = items;
      meeting.agendaItemInventoryComplete = true;
    }
  }
  const upcoming = selected.filter((meeting) => meeting.status === "Upcoming").length;
  return {
    source, scrapedAt: new Date().toISOString(), totalMeetingCount: selected.length,
    currentAndUpcomingCount: upcoming, archivedCount: selected.length - upcoming,
    meetings: selected
  };
}
