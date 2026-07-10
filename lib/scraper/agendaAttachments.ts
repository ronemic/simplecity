import fs from "node:fs/promises";
import path from "node:path";
import pdfParse, {
  type PdfAnnotation,
  type PdfPageData,
  type PdfTextItem
} from "pdf-parse";
import type { AgendaItem, PrimeGovMeeting } from "@/lib/types";
import { cleanText, slugify } from "@/lib/utils/slug";

export const MENLO_PARK_ATTACHMENT_MAX_PAGES = 20;
export const MENLO_PARK_ATTACHMENT_MAX_ITEMS = 12;
export const MENLO_PARK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const MENLO_PARK_ATTACHMENT_TIMEOUT_MS = 20_000;

export type PositionedPdfText = Pick<PdfTextItem, "str" | "transform" | "width" | "height">;

export type PositionedPdfLink = Pick<PdfAnnotation, "url" | "rect" | "subtype">;

export type AgendaPdfPage = {
  pageNumber: number;
  textItems: PositionedPdfText[];
  links: PositionedPdfLink[];
};

export type DiscoveredAgendaItem = {
  agendaNumber: string;
  title: string;
  rowText: string;
  pageNumber: number;
  links: Array<{ label: string; url: string }>;
};

type PositionedLine = {
  y: number;
  text: string;
};

function textCoordinate(item: PositionedPdfText, index: number) {
  return item.transform[index] || 0;
}

function groupTextLines(items: PositionedPdfText[]) {
  const sorted = [...items]
    .filter((item) => cleanText(item.str))
    .sort((left, right) => {
      const yDifference = textCoordinate(right, 5) - textCoordinate(left, 5);
      if (Math.abs(yDifference) > 2) return yDifference;
      return textCoordinate(left, 4) - textCoordinate(right, 4);
    });
  const lines: Array<{ y: number; items: PositionedPdfText[] }> = [];

  for (const item of sorted) {
    const y = textCoordinate(item, 5);
    const line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2);
    if (line) {
      line.items.push(item);
      continue;
    }
    lines.push({ y, items: [item] });
  }

  return lines
    .map((line): PositionedLine => ({
      y: line.y,
      text: cleanText(
        line.items
          .sort((left, right) => textCoordinate(left, 4) - textCoordinate(right, 4))
          .map((item) => item.str)
          .join(" ")
      )
    }))
    .filter((line) => line.text)
    .sort((left, right) => right.y - left.y);
}

function itemNumberMatch(text: string) {
  const match = text.match(/^([A-Z]+)\s*(\d+)\.\s*(.*)$/i);
  return match
    ? {
        agendaNumber: `${match[1]}${match[2]}`.toUpperCase(),
        remainder: match[3]
      }
    : null;
}

function cleanAgendaItemTitle(rowText: string) {
  return cleanText(rowText)
    .replace(/^[A-Z]+\s*\d+\.\s*/i, "")
    .replace(
      /\s*\(\s*(?:attachment|staff report|agenda report|presentation|staff presentation|applicant presentation)\b.*$/i,
      ""
    )
    .replace(/\s+City of Menlo Park\s+701 Laurel St\..*$/i, "")
    .trim();
}

function linkCenterY(link: PositionedPdfLink) {
  if (!link.rect || link.rect.length < 4) return null;
  return (link.rect[1] + link.rect[3]) / 2;
}

function linkLabel(lines: PositionedLine[], centerY: number, url: string) {
  const nearest = [...lines].sort(
    (left, right) => Math.abs(left.y - centerY) - Math.abs(right.y - centerY)
  )[0];
  const parenthetical = nearest?.text.match(/\((attachment|staff report|agenda report)[^)]*\)/i)?.[0];
  if (parenthetical) return parenthetical.slice(1, -1);

  try {
    return decodeURIComponent(path.basename(new URL(url).pathname)).replace(/\.pdf$/i, "") || "Attachment";
  } catch {
    return "Attachment";
  }
}

export function normalizeMenloParkAttachmentUrl(value?: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (hostname !== "menlopark.gov" && !hostname.endsWith(".menlopark.gov")) return null;
    if (!url.pathname.toLowerCase().startsWith("/files/sharedassets/")) return null;
    if (!url.pathname.toLowerCase().endsWith(".pdf")) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function associatePdfLinksWithAgendaItems(page: AgendaPdfPage): DiscoveredAgendaItem[] {
  const lines = groupTextLines(page.textItems);
  const starts = lines
    .map((line, index) => {
      const match = itemNumberMatch(line.text);
      return match
        ? {
            agendaNumber: match.agendaNumber,
            index,
            y: line.y
          }
        : null;
    })
    .filter((entry): entry is { agendaNumber: string; index: number; y: number } => Boolean(entry));
  const results: DiscoveredAgendaItem[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const next = starts[index + 1];
    const candidateBlockLines = lines.slice(start.index, next?.index ?? lines.length);
    const sectionHeaderIndex = candidateBlockLines.findIndex(
      (line, lineIndex) => lineIndex > 0 && /^[A-Z]{1,2}\.\s+/.test(line.text)
    );
    const footerIndex = candidateBlockLines.findIndex(
      (line, lineIndex) =>
        lineIndex > 0 &&
        (/^City of Menlo Park\b.*701 Laurel St\./i.test(line.text) || /^Page\s+[A-Z]+-?\d/i.test(line.text))
    );
    const boundaryIndexes = [sectionHeaderIndex, footerIndex].filter((value) => value > 0);
    const blockEndIndex =
      boundaryIndexes.length > 0 ? Math.min(...boundaryIndexes) : candidateBlockLines.length;
    const blockLines =
      blockEndIndex < candidateBlockLines.length
        ? candidateBlockLines.slice(0, blockEndIndex)
        : candidateBlockLines;
    const lowerBoundaryY =
      blockEndIndex < candidateBlockLines.length ? candidateBlockLines[blockEndIndex].y : next?.y;
    const rowText = cleanText(blockLines.map((line) => line.text).join(" "));
    const title = cleanAgendaItemTitle(rowText);
    const links = page.links
      .map((link) => {
        const url = normalizeMenloParkAttachmentUrl(link.url);
        const centerY = linkCenterY(link);
        if (!url || centerY === null) return null;
        if (centerY > start.y + 8) return null;
        if (lowerBoundaryY !== undefined && centerY <= lowerBoundaryY + 8) return null;
        return {
          label: linkLabel(blockLines, centerY, url),
          url
        };
      })
      .filter((link): link is { label: string; url: string } => Boolean(link));

    if (links.length > 0) {
      results.push({
        agendaNumber: start.agendaNumber,
        title,
        rowText,
        pageNumber: page.pageNumber,
        links
      });
    }
  }

  return results;
}

function linkPriority(link: { label: string; url: string }, agendaNumber: string) {
  const label = link.label.toLowerCase();
  let score = label.includes("staff report") ? 30 : label.includes("agenda report") ? 20 : 10;
  const filename = path.basename(new URL(link.url).pathname).toLowerCase();
  if (filename.startsWith(agendaNumber.toLowerCase())) score += 5;
  return score;
}

export function selectAgendaItemAttachments(
  items: DiscoveredAgendaItem[],
  limit = MENLO_PARK_ATTACHMENT_MAX_ITEMS
) {
  const seenItems = new Set<string>();
  const seenUrls = new Set<string>();
  const selected: Array<DiscoveredAgendaItem & { selectedLink: { label: string; url: string } }> = [];

  for (const item of items) {
    if (selected.length >= limit) break;
    if (seenItems.has(item.agendaNumber)) continue;

    const link = [...item.links]
      .filter((candidate) => !seenUrls.has(candidate.url))
      .sort(
        (left, right) =>
          linkPriority(right, item.agendaNumber) - linkPriority(left, item.agendaNumber)
      )[0];
    if (!link) continue;

    seenItems.add(item.agendaNumber);
    seenUrls.add(link.url);
    selected.push({ ...item, selectedLink: link });
  }

  return selected;
}

export async function extractAgendaPdfPages(localPath: string): Promise<AgendaPdfPage[]> {
  const buffer = await fs.readFile(localPath);
  const pages: AgendaPdfPage[] = [];
  let pageNumber = 0;

  await pdfParse(buffer, {
    version: "v2.0.550",
    max: MENLO_PARK_ATTACHMENT_MAX_PAGES,
    pagerender: async (page: PdfPageData) => {
      pageNumber += 1;
      const [textContent, annotations] = await Promise.all([
        page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }),
        page.getAnnotations()
      ]);
      pages.push({
        pageNumber,
        textItems: textContent.items,
        links: annotations
      });
      return textContent.items.map((item) => item.str).join(" ");
    }
  });

  return pages;
}

function agendaDocumentCandidates(meeting: PrimeGovMeeting) {
  return meeting.documents.filter(
    (doc) =>
      Boolean(doc.localPath?.toLowerCase().endsWith(".pdf")) &&
      (doc.type === "Agenda" || doc.type === "Agenda Packet") &&
      !doc.isAgendaItemAttachment
  );
}

function itemExternalId(meeting: PrimeGovMeeting, agendaNumber: string) {
  return slugify(`${meeting.externalId || meeting.title}-${agendaNumber}`);
}

export async function discoverMenloParkAgendaAttachments(
  meetings: PrimeGovMeeting[],
  options: { log?: (message: string) => void; shouldStop?: () => boolean } = {}
) {
  const log = options.log || (() => undefined);
  let discovered = 0;
  let skipped = 0;

  for (const meeting of meetings) {
    if (options.shouldStop?.()) break;
    if (meeting.jurisdictionSlug !== "menlo-park") continue;

    const foundItems: DiscoveredAgendaItem[] = [];
    const parentByItem = new Map<string, string>();

    for (const agendaDocument of agendaDocumentCandidates(meeting)) {
      if (!agendaDocument.localPath) continue;
      try {
        const pages = await extractAgendaPdfPages(agendaDocument.localPath);
        for (const page of pages) {
          for (const item of associatePdfLinksWithAgendaItems(page)) {
            foundItems.push(item);
            parentByItem.set(item.agendaNumber, agendaDocument.url);
          }
        }
      } catch (error) {
        skipped += 1;
        const message = error instanceof Error ? error.message : "Unknown PDF link extraction error";
        meeting.extractionNotes = [
          ...(meeting.extractionNotes || []),
          `Agenda attachment discovery skipped for ${agendaDocument.label}: ${message}`
        ];
        log(`Agenda attachment discovery failed for ${agendaDocument.url}: ${message}`);
      }
    }

    const existingByUrl = new Map(
      meeting.documents.map((doc) => [normalizeMenloParkAttachmentUrl(doc.url) || doc.url, doc])
    );
    const selected = selectAgendaItemAttachments(foundItems);
    const newItems: AgendaItem[] = [];

    for (const item of selected) {
      const parentDocumentUrl = parentByItem.get(item.agendaNumber) || meeting.sourceUrl || "";
      let attachment = existingByUrl.get(item.selectedLink.url);

      if (!attachment) {
        attachment = {
          jurisdictionName: meeting.jurisdictionName,
          jurisdictionSlug: meeting.jurisdictionSlug,
          platform: meeting.platform,
          type: "Attachment",
          label: item.selectedLink.label || `Agenda item ${item.agendaNumber} attachment`,
          url: item.selectedLink.url
        };
        meeting.documents.push(attachment);
        existingByUrl.set(item.selectedLink.url, attachment);
        discovered += 1;
      }

      attachment.agendaItemNumber = item.agendaNumber;
      attachment.agendaItemTitle = item.title;
      attachment.parentDocumentUrl = parentDocumentUrl;
      attachment.isAgendaItemAttachment = true;

      newItems.push({
        externalId: itemExternalId(meeting, item.agendaNumber),
        fileNumber: null,
        agendaNumber: item.agendaNumber,
        itemType: null,
        title: item.title,
        action: null,
        result: null,
        sourceUrl: parentDocumentUrl,
        rowText: item.rowText,
        attachments: [attachment]
      });
    }

    if (newItems.length > 0) {
      const otherItems = (meeting.items || []).filter(
        (item) => !newItems.some((candidate) => candidate.agendaNumber === item.agendaNumber)
      );
      meeting.items = [...otherItems, ...newItems];
      meeting.extractionNotes = [
        ...(meeting.extractionNotes || []),
        `Associated ${newItems.length} embedded agenda attachment link(s) with Menlo Park agenda items.`
      ];
      log(`Associated ${newItems.length} item-aware attachment(s) for ${meeting.title}.`);
    }
  }

  return { discovered, skipped };
}
