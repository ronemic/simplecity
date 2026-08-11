import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
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
  createStreamDownloadBudget,
  streamDownloadToTemp
} from "@/lib/scraper/streamDownload";
import { scrapeLegistarMeetings } from "@/lib/sources/legistar";
import { cleanText, slugify } from "@/lib/utils/slug";
import { parseMeetingDate } from "@/lib/utils/date";
import { getMeetingWindow } from "@/lib/utils/meetingWindow";

export const SANTA_BARBARA_PLANNING_COMMISSION_URL =
  "https://www.countyofsb.org/pl-county-planning-commission";
export const SANTA_BARBARA_PLANNING_COMMISSION_BOX_URL =
  "https://cosantabarbara.app.box.com/s/q97rv82305oyfnbdjhcyxrrdhu3dgkqy";

const BOX_REQUEST_TIMEOUT_MS = 60_000;

type SantaBarbaraCountyOptions = ScrapePortalOptions & {
  jurisdiction: JurisdictionConfig;
  limit?: number;
  monthsBack?: number;
  monthsForward?: number;
};

type BoxItem = {
  type: "folder" | "file";
  id: number;
  name: string;
  extension?: string | null;
  itemSize?: number | null;
};

type BoxFolderPayload = {
  items: BoxItem[];
  pageCount?: number;
  pageNumber?: number;
};

type PlanningFolder = BoxItem & {
  type: "folder";
  dateText: string;
  dateKey: string;
  timestamp: number;
  cancelled: boolean;
};

function extractAssignedJson(html: string, assignment: string): unknown {
  const assignmentIndex = html.indexOf(assignment);
  if (assignmentIndex < 0) throw new Error(`Box page did not contain ${assignment.trim()}.`);

  const start = html.indexOf("{", assignmentIndex + assignment.length);
  if (start < 0) throw new Error(`Box page contained no JSON after ${assignment.trim()}.`);

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1));
    }
  }

  throw new Error(`Box page contained incomplete JSON after ${assignment.trim()}.`);
}

export function parseBoxSharedFolderHtml(html: string): BoxFolderPayload {
  const data = extractAssignedJson(html, "Box.postStreamData = ") as Record<
    string,
    Partial<BoxFolderPayload>
  >;
  const folder = Object.values(data).find((value) => Array.isArray(value?.items));
  if (!folder || !Array.isArray(folder.items)) {
    throw new Error("Box shared-folder response did not contain folder items.");
  }
  return {
    items: folder.items.filter(
      (item): item is BoxItem =>
        Boolean(item) &&
        (item.type === "folder" || item.type === "file") &&
        Number.isFinite(item.id) &&
        typeof item.name === "string"
    ),
    pageCount: Number(folder.pageCount || 1),
    pageNumber: Number(folder.pageNumber || 1)
  };
}

export function parsePlanningCommissionFolder(item: BoxItem): PlanningFolder | null {
  if (item.type !== "folder") return null;
  const match = item.name.match(/\b(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})\b/);
  if (!match) return null;
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const dateText = `${Number(match[1])}/${Number(match[2])}/${year}`;
  const parsed = parseMeetingDate(`${dateText} 9:00 AM`);
  if (!parsed) return null;
  return {
    ...item,
    type: "folder",
    dateText,
    dateKey: parsed.slice(0, 10),
    timestamp: new Date(parsed).getTime(),
    cancelled: /\b(?:cancell?ed|to be adjourned)\b/i.test(item.name)
  };
}

export function classifyPlanningCommissionDocument(name: string): DocumentType {
  const normalized = cleanText(name).toLowerCase();
  if (/marked agenda|action (?:summary|letter)|minutes/.test(normalized)) return "Minutes";
  if (/cancel|no meeting|adjournment/.test(normalized)) return "Notice of Cancellation";
  if (/agenda/.test(normalized)) return "Agenda";
  return "Document";
}

function dateKeyFromText(value: string) {
  const match = value.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})\b/);
  if (!match) return null;
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  return parseMeetingDate(`${match[1]}/${match[2]}/${year}`)?.slice(0, 10) || null;
}

function boxFolderUrl(folderId: number) {
  return `${SANTA_BARBARA_PLANNING_COMMISSION_BOX_URL}/folder/${folderId}`;
}

function boxFileUrl(fileId: number) {
  return `${SANTA_BARBARA_PLANNING_COMMISSION_BOX_URL}/file/${fileId}`;
}

async function fetchBoxHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 SimpleCity Santa Barbara County scraper"
    },
    signal: AbortSignal.timeout(BOX_REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Box returned HTTP ${response.status} for ${url}`);
  return response.text();
}

async function listBoxFolder(folderUrl: string) {
  const first = parseBoxSharedFolderHtml(await fetchBoxHtml(folderUrl));
  const items = [...first.items];
  for (let page = 2; page <= Math.max(1, first.pageCount || 1); page += 1) {
    const pageUrl = new URL(folderUrl);
    pageUrl.searchParams.set("page", String(page));
    items.push(...parseBoxSharedFolderHtml(await fetchBoxHtml(pageUrl.toString())).items);
  }
  return Array.from(new Map(items.map((item) => [`${item.type}:${item.id}`, item])).values());
}

function planningDocument(item: BoxItem, meetingDateText: string): PrimeGovDocument {
  const type = classifyPlanningCommissionDocument(item.name);
  const label = /marked agenda/i.test(item.name)
    ? `Marked Agenda — ${meetingDateText}`
    : item.name;
  return {
    type,
    label,
    url: boxFileUrl(item.id),
    bytes: item.itemSize || null
  };
}

function planningCommissionAgendaItems(
  text: string,
  meeting: PrimeGovMeeting,
  sourceUrl: string
): AgendaItem[] {
  const standardAgendaIndex = text.search(/(?:^|\n)\s*STANDARD AGENDA\s*:/i);
  if (standardAgendaIndex < 0) return [];
  const standardAgenda = text.slice(standardAgendaIndex);
  const numberedLines = Array.from(standardAgenda.matchAll(/^\s*(\d{1,2})\.\s+(.+)$/gm));
  const starts = numberedLines.filter((match, index) => {
    const start = match.index || 0;
    const next = numberedLines[index + 1]?.index ?? standardAgenda.length;
    const initialBlock = standardAgenda.slice(start, next);
    return (
      /\b\d{2}[A-Z]{2,6}-\d{5}\b/.test(match[2]) ||
      /\bHearing\s+(?:on|at)\b/i.test(initialBlock)
    );
  });

  return starts.flatMap((match, index) => {
    const start = match.index || 0;
    const end = starts[index + 1]?.index ?? standardAgenda.length;
    const block = standardAgenda.slice(start, end).trim();
    const actionStarts = Array.from(block.matchAll(/(?:^|\n)\s*ACTION:\s*/g));
    const actionResults = actionStarts
      .map((action, actionIndex) => {
        const actionStart = (action.index || 0) + action[0].length;
        const actionEnd = actionStarts[actionIndex + 1]?.index ?? block.length;
        const raw = block
          .slice(actionStart, actionEnd)
          .replace(/\n\s*(?:\d{2}[A-Z]{2,6}-\d{5}\s*\n){2,}[\s\S]*$/i, "")
          .replace(/\n\s*_{5,}[\s\S]*$/, "");
        return cleanText(raw).slice(0, 6000);
      })
      .filter(Boolean);
    const substantiveActions = actionResults.filter(
      (result) => !/\b(?:accept|admit).*\blate submittal\b/i.test(result)
    );
    const results = substantiveActions.length > 0 ? substantiveActions : actionResults;
    const agendaNumber = match[1];
    const title = cleanText(match[2]);
    const fileNumber = block.match(/\b\d{2}[A-Z]{2,6}-\d{5}\b/)?.[0] || null;

    const actionTitle = (result: string) => {
      const subjects = Array.from(
        result.matchAll(
          /\b(?:approve|adopt|deny|reject|continue|receive)s?\s+(?:the\s+)?([^.;]{4,300}?)(?=\s+by\s+(?:adopt|approv|deny|reject|continu)|\s+Vote\s*:|[.;]|$)/gi
        )
      );
      const subject = subjects.at(-1)?.[1];
      return subject ? cleanText(subject).slice(0, 800) : title;
    };
    const itemResults = results.length > 0 ? results : [null];

    return itemResults.map((result, resultIndex) => ({
      externalId: `${meeting.externalId}:agenda-item:${agendaNumber}${itemResults.length > 1 ? `:action:${resultIndex + 1}` : ""}`,
      fileNumber: result?.match(/\b\d{2}[A-Z]{2,6}-\d{5}\b/)?.[0] || fileNumber,
      agendaNumber:
        itemResults.length > 1
          ? `${agendaNumber}${String.fromCharCode(65 + resultIndex)}`
          : agendaNumber,
      itemType: null,
      title: result && itemResults.length > 1 ? actionTitle(result) : title,
      action: result,
      result,
      sourceUrl,
      rowText: result || cleanText(block).slice(0, 12_000),
      status: meeting.status,
      meetingBody: meeting.bodyName || meeting.meetingType || meeting.title,
      onAgenda: null,
      recommendedAction: null,
      legislationText: null,
      attachments: []
    }));
  });
}

export function enrichSantaBarbaraPlanningCommissionItems(meetings: PrimeGovMeeting[]) {
  let enriched = 0;
  for (const meeting of meetings) {
    if (meeting.bodyName !== "County Planning Commission") continue;
    const agendaDocument = meeting.documents.find(
      (document) => document.type === "Agenda" && Boolean(document.extractedText)
    );
    const resultDocument =
      meeting.documents.find(
        (document) =>
          document.type === "Minutes" &&
          /marked agenda/i.test(document.label || "") &&
          Boolean(document.extractedText)
      ) ||
      meeting.documents.find(
        (document) => document.type === "Minutes" && Boolean(document.extractedText)
      );
    const baseDocument = agendaDocument || resultDocument;
    if (!baseDocument?.extractedText) continue;

    const baseItems = planningCommissionAgendaItems(
      baseDocument.extractedText,
      meeting,
      baseDocument.url
    );
    const resultItems = resultDocument?.extractedText
      ? planningCommissionAgendaItems(resultDocument.extractedText, meeting, resultDocument.url)
      : [];
    const resultsByNumber = new Map<string | null, AgendaItem[]>();
    for (const resultItem of resultItems) {
      const baseAgendaNumber = resultItem.agendaNumber?.replace(/[A-Z]+$/i, "") || null;
      const existing = resultsByNumber.get(baseAgendaNumber) || [];
      existing.push(resultItem);
      resultsByNumber.set(baseAgendaNumber, existing);
    }
    meeting.items = baseItems.flatMap((item) => {
      const officialResults = resultsByNumber.get(item.agendaNumber) || [];
      if (officialResults.length === 0) return [item];
      return officialResults.map((officialResult) => ({
        ...item,
        externalId: officialResult.externalId,
        fileNumber: officialResult.fileNumber || item.fileNumber,
        agendaNumber: officialResult.agendaNumber,
        title: officialResult.title || item.title,
        action: officialResult.action,
        result: officialResult.result,
        sourceUrl: officialResult.sourceUrl,
        rowText: cleanText(
          [
            officialResults.length === 1 ? item.rowText : officialResult.title,
            "Official marked-agenda result:",
            officialResult.result
          ]
            .filter(Boolean)
            .join("\n")
        ).slice(0, 12_000)
      }));
    });
    enriched += meeting.items.length;
  }
  return enriched;
}

type BoxFileDownloadMetadata = {
  downloadUrl: string;
  token: string;
};

function parseBoxFileDownloadMetadata(html: string, fileId: number): BoxFileDownloadMetadata {
  const data = extractAssignedJson(html, "Box.prefetchedData = ") as {
    preview_metadata?: { authenticated_download_url?: string };
    preview_prefetch_token_map?: Record<string, { read?: string }>;
  };
  const downloadUrl = data.preview_metadata?.authenticated_download_url;
  const token = data.preview_prefetch_token_map?.[String(fileId)]?.read;
  if (!downloadUrl || !token) {
    throw new Error(`Box did not provide a public download token for file ${fileId}.`);
  }
  return { downloadUrl, token };
}

function isAllowedBoxDownloadUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (hostname === "box.com" ||
        hostname.endsWith(".box.com") ||
        hostname === "boxcloud.com" ||
        hostname.endsWith(".boxcloud.com"))
    );
  } catch {
    return false;
  }
}

export async function downloadSantaBarbaraPlanningCommissionDocuments(
  meetings: PrimeGovMeeting[],
  outputDir: string,
  log: (message: string) => void,
  shouldStop?: () => boolean
) {
  await fs.mkdir(outputDir, { recursive: true });
  const downloadBudget = createStreamDownloadBudget();
  let downloaded = 0;
  let failed = 0;

  for (const meeting of meetings) {
    for (const document of meeting.documents) {
      if (shouldStop?.()) return { downloaded, failed };
      const match = document.url.match(/\/file\/(\d+)/);
      if (!match || document.type === "Notice of Cancellation") continue;
      const fileId = Number(match[1]);
      const sourceHash = crypto
        .createHash("sha256")
        .update(document.url)
        .digest("hex")
        .slice(0, 10);
      const filename = [
        slugify(meeting.externalId || meeting.title).slice(0, 80),
        slugify(document.type),
        `${fileId}-${sourceHash}.pdf`
      ].join("__");
      const filePath = path.join(outputDir, filename);
      let transfer: Awaited<ReturnType<typeof streamDownloadToTemp>> | null = null;
      try {
        const metadata = parseBoxFileDownloadMetadata(await fetchBoxHtml(document.url), fileId);
        const downloadUrl = new URL(metadata.downloadUrl);
        downloadUrl.searchParams.set("shared_link", SANTA_BARBARA_PLANNING_COMMISSION_BOX_URL);
        transfer = await streamDownloadToTemp(null, downloadUrl.toString(), filePath, {
          headers: { Authorization: `Bearer ${metadata.token}` },
          validateUrl: isAllowedBoxDownloadUrl,
          shouldStop,
          budget: downloadBudget
        });
        if (transfer.prefix.subarray(0, 5).toString() !== "%PDF-") {
          throw new Error("Box document response was not a PDF.");
        }
        await transfer.commit(filePath);
        document.localPath = filePath;
        document.bytes = transfer.bytes;
        document.downloadError = null;
        downloaded += 1;
        log(`Downloaded Santa Barbara Planning Commission document: ${filePath}`);
      } catch (error) {
        document.localPath = null;
        document.downloadError =
          error instanceof Error ? error.message : "Unknown Box document download error";
        failed += 1;
        log(`Santa Barbara Planning Commission download failed for ${document.url}: ${document.downloadError}`);
      } finally {
        await transfer?.cleanup();
      }
    }
  }

  return { downloaded, failed };
}

export async function scrapeSantaBarbaraPlanningCommissionMeetings(
  options: SantaBarbaraCountyOptions
): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const window = getMeetingWindow(options);
  const startYear = new Date(window.start).getUTCFullYear();
  const endYear = new Date(window.end - 1).getUTCFullYear();
  const rootItems = await listBoxFolder(SANTA_BARBARA_PLANNING_COMMISSION_BOX_URL);
  const yearFolders = rootItems.filter(
    (item): item is BoxItem & { type: "folder" } =>
      item.type === "folder" &&
      /^\d{4}$/.test(item.name.trim()) &&
      Number(item.name.trim()) >= startYear &&
      Number(item.name.trim()) <= endYear
  );
  if (yearFolders.length === 0) {
    throw new Error(
      `Santa Barbara Planning Commission Box folder has no year directory for ${startYear}-${endYear}.`
    );
  }

  const meetingFolders: PlanningFolder[] = [];
  for (const yearFolder of yearFolders) {
    const items = await listBoxFolder(boxFolderUrl(yearFolder.id));
    meetingFolders.push(
      ...items
        .map(parsePlanningCommissionFolder)
        .filter((item): item is PlanningFolder => Boolean(item))
        .filter((item) => item.timestamp >= window.start && item.timestamp < window.end)
    );
  }
  meetingFolders.sort((left, right) => right.timestamp - left.timestamp);
  const selectedFolders = options.limit
    ? meetingFolders.slice(0, Math.max(0, options.limit))
    : meetingFolders;

  const meetings: PrimeGovMeeting[] = [];
  const reassignedMinutes: Array<{ document: PrimeGovDocument; targetDateKey: string }> = [];
  const now = Date.now();
  for (const folder of selectedFolders) {
    const folderUrl = boxFolderUrl(folder.id);
    const items = await listBoxFolder(folderUrl);
    const documents: PrimeGovDocument[] = [];
    for (const item of items) {
      if (item.type !== "file" || String(item.extension || "").toLowerCase() !== "pdf") continue;
      const document = planningDocument(item, folder.dateText);
      const namedDateKey = document.type === "Minutes" ? dateKeyFromText(item.name) : null;
      if (namedDateKey && namedDateKey !== folder.dateKey) {
        reassignedMinutes.push({ document, targetDateKey: namedDateKey });
      } else {
        documents.push(document);
      }
    }

    const isPast = folder.timestamp < now;
    meetings.push({
      externalId: `santa-barbara-county:box-planning-commission:${folder.id}`,
      jurisdictionName: options.jurisdiction.name,
      jurisdictionSlug: options.jurisdiction.slug,
      platform: "official-site",
      section: isPast ? "Past Meetings" : "Upcoming Meetings",
      title: "County Planning Commission",
      bodyName: "County Planning Commission",
      meetingType: "County Planning Commission",
      dateText: folder.dateText,
      timeText: "9:00 AM",
      location: "Planning Commission Hearing Room, 123 East Anapamu Street, Santa Barbara",
      rowText: cleanText(
        ["County Planning Commission", folder.dateText, "9:00 AM", folder.name].join(" | ")
      ),
      status: folder.cancelled ? "Cancelled" : isPast ? "Past" : "Upcoming",
      source: SANTA_BARBARA_PLANNING_COMMISSION_URL,
      sourceUrl: folderUrl,
      sectionUrl: SANTA_BARBARA_PLANNING_COMMISSION_URL,
      meetingDetailsUrl: folderUrl,
      hasHtmlAgenda: false,
      hasPdf: documents.length > 0,
      documents,
      detailText: folder.name
    });
  }

  const meetingsByDate = new Map(
    meetings.map((meeting) => [
      parseMeetingDate(`${meeting.dateText || ""} ${meeting.timeText || ""}`)?.slice(0, 10),
      meeting
    ])
  );
  for (const entry of reassignedMinutes) {
    const target = meetingsByDate.get(entry.targetDateKey);
    if (target && !target.documents.some((document) => document.url === entry.document.url)) {
      target.documents.push(entry.document);
      target.hasPdf = true;
    }
  }

  if (options.downloadDocuments) {
    log("Downloading Santa Barbara County Planning Commission agendas and results from Box.");
    const result = await downloadSantaBarbaraPlanningCommissionDocuments(
      meetings,
      options.documentOutputDir || path.join(process.cwd(), "scraped-primegov", options.jurisdiction.slug, "documents"),
      log,
      options.shouldStop
    );
    log(
      `Santa Barbara County Planning Commission downloads complete: ${result.downloaded} downloaded, ${result.failed} failed.`
    );
  }

  const upcoming = meetings.filter((meeting) => meeting.status === "Upcoming").length;
  const archived = meetings.length - upcoming;
  log(
    `Santa Barbara County Planning Commission Box returned ${meetings.length} meeting(s), including ${meetings.reduce((sum, meeting) => sum + meeting.documents.filter((document) => document.type === "Minutes").length, 0)} result document(s).`
  );
  return {
    source: SANTA_BARBARA_PLANNING_COMMISSION_URL,
    scrapedAt: new Date().toISOString(),
    totalMeetingCount: meetings.length,
    currentAndUpcomingCount: upcoming,
    archivedCount: archived,
    meetings
  };
}

function meetingTimestamp(meeting: PrimeGovMeeting) {
  const parsed = parseMeetingDate([meeting.dateText, meeting.timeText].filter(Boolean).join(" "));
  return parsed ? new Date(parsed).getTime() : 0;
}

export async function scrapeSantaBarbaraCountyMeetings(
  options: SantaBarbaraCountyOptions
): Promise<ScrapePortalResult> {
  const log = options.log || (() => undefined);
  const [boardResult, planningResult] = await Promise.allSettled([
    scrapeLegistarMeetings(options),
    scrapeSantaBarbaraPlanningCommissionMeetings(options)
  ]);
  const errors: string[] = [];
  const results: ScrapePortalResult[] = [];
  if (boardResult.status === "fulfilled") results.push(boardResult.value);
  else errors.push(
    `Santa Barbara Board of Supervisors source failed: ${boardResult.reason instanceof Error ? boardResult.reason.message : String(boardResult.reason)}`
  );
  if (planningResult.status === "fulfilled") results.push(planningResult.value);
  else errors.push(
    `Santa Barbara County Planning Commission source failed: ${planningResult.reason instanceof Error ? planningResult.reason.message : String(planningResult.reason)}`
  );
  for (const error of errors) log(error);

  let meetings = results.flatMap((result) => result.meetings);
  meetings.sort((left, right) => meetingTimestamp(right) - meetingTimestamp(left));
  if (options.limit) meetings = meetings.slice(0, Math.max(0, options.limit));
  if (meetings.length === 0) {
    throw new Error(errors.join(" ") || "Santa Barbara County sources returned zero meetings.");
  }
  const upcoming = meetings.filter((meeting) => meeting.status === "Upcoming").length;
  return {
    source: options.jurisdiction.sourceUrl,
    scrapedAt: new Date().toISOString(),
    totalMeetingCount: meetings.length,
    currentAndUpcomingCount: upcoming,
    archivedCount: meetings.length - upcoming,
    meetings,
    errors
  };
}
