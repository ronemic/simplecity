import type { PrimeGovMeeting } from "@/lib/types";
import { civicCalendarDay } from "@/lib/utils/date";

export type CouncilMeetingKind = "Regular" | "Special";

export type CouncilMinutesAttachment = {
  /** The attachment's own name, e.g. "Att 1 - Minutes 2026-7-20 Special". */
  label: string;
  url: string;
  /** The day the minutes record, as YYYY-MM-DD. */
  day: string;
  kind: CouncilMeetingKind;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const ATTACHMENT_ANCHOR = /<a\b[^>]*>/gi;
const MINUTES_ATTACHMENT_TITLE =
  /^Download\s+(.*?\bMinutes\s+(\d{4})-(\d{1,2})-(\d{1,2})\s+(Regular|Special)\b.*)$/i;
const COUNCIL_MINUTES_HEADER =
  /City Council\s+(Regular|Special)\s+Meeting\s+Minutes\s*[–—-]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i;

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeEntities(match[1]) : null;
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dayStamp(year: string, month: string, day: string) {
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function titleCase(kind: string): CouncilMeetingKind {
  return kind.toLowerCase() === "special" ? "Special" : "Regular";
}

/**
 * San Mateo posts a City Council meeting's minutes on the portal months after
 * the meeting. Before that, the draft minutes go out as attachments to the
 * "City Council Meeting Minutes — Approval" consent item of a later agenda,
 * named like "Att 1 - Minutes 2026-7-20 Special". Read those download links
 * from a PrimeGov HTML agenda page.
 */
export function findCouncilMinutesAttachments(html: string, pageUrl: string): CouncilMinutesAttachment[] {
  if (!/City Council Meeting Minutes/i.test(html)) return [];
  const found = new Map<string, CouncilMinutesAttachment>();
  for (const [tag] of html.matchAll(ATTACHMENT_ANCHOR)) {
    const href = attribute(tag, "href");
    const title = attribute(tag, "title");
    if (!href || !title || !/historyattachment/i.test(href)) continue;
    const match = title.match(MINUTES_ATTACHMENT_TITLE);
    if (!match) continue;
    const day = dayStamp(match[2], match[3], match[4]);
    if (!day) continue;
    let url: string;
    try {
      url = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    if (!found.has(url)) {
      found.set(url, { label: match[1], url, day, kind: titleCase(match[5]) });
    }
  }
  return Array.from(found.values());
}

/**
 * The header every San Mateo council minutes page prints, e.g.
 * "City Council Special Meeting Minutes – 7/20/2026". The attachment name is
 * typed by hand, so the document itself has the final say on which meeting it
 * records.
 */
export function councilMinutesHeader(text: string) {
  const match = String(text || "").match(COUNCIL_MINUTES_HEADER);
  if (!match) return null;
  const day = dayStamp(match[4], match[2], match[3]);
  return day ? { day, kind: titleCase(match[1]) } : null;
}

function councilMeetingKind(meeting: Pick<PrimeGovMeeting, "title" | "bodyName">): CouncilMeetingKind | null {
  const title = `${meeting.title || ""}`;
  if (!/^\s*City Council\b/i.test(title)) return null;
  const kind = title.match(/\b(Regular|Special)\b/i)?.[1];
  return kind ? titleCase(kind) : null;
}

/** The one stored City Council meeting the minutes record, or null when none or several match. */
export function selectCouncilMinutesTarget<T extends Pick<PrimeGovMeeting, "title" | "bodyName" | "dateText">>(
  meetings: T[],
  minutes: { day: string; kind: CouncilMeetingKind }
) {
  const candidates = meetings.filter((meeting) =>
    councilMeetingKind(meeting) === minutes.kind &&
    civicCalendarDay(meeting.dateText) === minutes.day
  );
  return candidates.length === 1 ? candidates[0] : null;
}

export function isSanMateoCouncilMeeting(meeting: Pick<PrimeGovMeeting, "title" | "bodyName">) {
  return councilMeetingKind(meeting) !== null;
}

/**
 * Outcome matching rejects minutes whose label names a different day than the
 * meeting, so the minutes' own date comes first.
 */
export function councilMinutesLabel(day: string, kind: CouncilMeetingKind, agendaDateText: string) {
  const [year, month, date] = day.split("-").map(Number);
  const agendaDay = civicCalendarDay(agendaDateText);
  const agenda = agendaDay
    ? (() => {
        const [y, m, d] = agendaDay.split("-").map(Number);
        return `${MONTHS[m - 1]} ${d}, ${y}`;
      })()
    : agendaDateText;
  return `Minutes of the ${MONTHS[month - 1]} ${date}, ${year} ${kind} Meeting (attached to the ${agenda} City Council agenda)`;
}
