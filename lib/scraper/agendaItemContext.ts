import type { AgendaItem, PrimeGovMeeting } from "@/lib/types";
import { cleanText, slugify } from "@/lib/utils/slug";
import { agendaItemSimilarity } from "@/lib/utils/agendaItemIdentity";

const AGENDA_NUMBER_SOURCE = "[A-Za-z]?\\d{1,2}(?:\\.\\d{1,3})?";
const ITEM_START = new RegExp(
  `(?:^|\\s)(?:(?:[Aa]genda\\s+)?[Ii]tem\\s+)?(${AGENDA_NUMBER_SOURCE})\\s*(?:[.):-]\\s*|\\s+)([A-Z][\\s\\S]*?)(?=(?:\\s(?:(?:[Aa]genda\\s+)?[Ii]tem\\s+)?${AGENDA_NUMBER_SOURCE}\\s*(?:[.):-]\\s*|\\s+)[A-Z])|$)`,
  "g"
);
const RECOMMENDATION = /\b(?:recommendation|recommended action|action requested)\s*:?\s*([\s\S]*)/i;
const SUBJECT = /\bsubject\s*:?\s*([\s\S]{1,500}?)(?=\s+\b(?:recommendation|recommended action|background|analysis|public notice)\b)/gi;
const SECTION_TITLE = /^(?:call to order(?: and roll call)?|roll call|opening remarks?|approval of (?:the )?agenda|approval of (?:the )?minutes|approval of (?:the )?consent calendar|public comments?|consent calendar|study sessions?|special presentations?|presentations?|public hearings?|staff(?:\/(?:commission|committee))?(?: oral)? reports?|commission reports?|committee reports?|old business|new business|regular business|business items?|informational (?:items?|reports?)|discussion and action|written communications?|future (?:commission )?agenda item requests?|adjournment)\s*:?\s*$/i;
const RECOMMENDATION_END = /\s+\b(?:background|analysis|discussion|fiscal impact|financial impact|public notice|attachments?|conclusion)\s*:?/i;

function currentMeetingBoundary(text: string) {
  const staffReport = text.search(
    /\b(?:(?:COMMISSION|COMMITTEE|COUNCIL|BOARD) REPORTS?\s+\d+(?:\.\d+)?[\s\S]{0,200}?)?[A-Z][A-Z &()/.-]{2,120}\s+STAFF REPORT\b/
  );
  const packetAttachment = text.search(/\bATTACHMENTS?\s+\d*\s+(?:EAST PALO ALTO|CITY OF|COUNTY OF)\b/);
  const adjournment = text.search(
    /(?:^|\n)\s*(?:\d{1,2}\s*[.):-]\s*)?ADJOURNMENT\b/im
  );
  const boundary = [staffReport, packetAttachment, adjournment]
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0];
  return boundary || text.length;
}

export function currentMeetingSourceText(text: string) {
  return text.slice(0, currentMeetingBoundary(text));
}

function currentAgendaSection(text: string) {
  const currentSource = currentMeetingSourceText(text);
  const openingItem = currentSource.search(
    /(?:^|\n)\s*(?:1\s*[.):-]\s*)?(?:call to order|roll call|opening remarks?)\b/im
  );
  const start = openingItem >= 0 ? openingItem : 0;
  return currentSource.slice(start);
}

function isSectionTitle(value: string) {
  const withoutSectionNumber = value.replace(/^[A-Z]\s*[.):-]\s*/i, "");
  return (
    SECTION_TITLE.test(withoutSectionNumber) ||
    /^future\b.{0,80}\bitem requests?\b/i.test(withoutSectionNumber)
  );
}

function precedingSectionTitle(lines: string[], lineIndex: number) {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const candidate = cleanText(lines[index]);
    if (isSectionTitle(candidate)) return candidate;
  }
  return null;
}

function sectionTitleAtOffset(text: string, offset: number) {
  const precedingLines = text.slice(0, offset).split(/\r?\n/);
  return precedingSectionTitle(precedingLines, precedingLines.length);
}

function cleanItemTitle(value: string) {
  return cleanText(
    value
      .split(/\n\s*\n/)[0]
      .split(/\b(?:recommendation|recommended action|action requested)\s*:?/i)[0]
      .replace(/\s*\(Staff Report\s*#[^)]+\)\s*$/i, "")
      .replace(/\s+Page\s+\d+.*$/i, "")
  ).slice(0, 800);
}

function extractRecommendation(value: string) {
  const recommendation = value.match(RECOMMENDATION)?.[1] || "";
  return cleanText(recommendation.split(RECOMMENDATION_END)[0]).slice(0, 2500) || null;
}

function staffReportSections(text: string) {
  const matches = Array.from(text.matchAll(SUBJECT));
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = matches[index + 1]?.index || Math.min(text.length, start + 8000);
    const rowText = cleanText(text.slice(start, end)).slice(0, 6000);
    return {
      title: cleanText(match[1]),
      rowText,
      action: extractRecommendation(rowText)
    };
  });
}

function bestStaffReport(
  title: string,
  reports: ReturnType<typeof staffReportSections>
) {
  return reports
    .map((candidate) => ({
      ...candidate,
      score: agendaItemSimilarity(title, candidate.title)
    }))
    .filter((candidate) => candidate.score >= 0.6)
    .sort((left, right) => right.score - left.score)[0];
}

function unnumberedAgendaItems(
  meeting: PrimeGovMeeting,
  agendaText: string,
  staffReports: ReturnType<typeof staffReportSections>,
  existingItems: AgendaItem[]
) {
  const lines = agendaText.split(/\r?\n/);
  const recommendations = lines.flatMap((line, lineIndex) => {
    if (!/^\s*(?:recommendation|recommended action|action requested)\s*:?/i.test(line)) {
      return [];
    }

    let titleEnd = lineIndex - 1;
    while (titleEnd >= 0 && !lines[titleEnd].trim()) titleEnd -= 1;
    const titleLines: string[] = [];
    let titleStart = titleEnd;
    for (let index = titleEnd; index >= 0 && titleLines.length < 4; index -= 1) {
      const candidate = lines[index].trim();
      if (
        !candidate ||
        isSectionTitle(candidate) ||
        /^\d+[.)]\s+/.test(candidate) ||
        /^(?:\d+\s*)+$/.test(candidate) ||
        (titleLines.length > 0 && /[.;]$/.test(candidate))
      ) {
        break;
      }
      if (/^(?:recommendation|recommended action|action requested)\s*:?/i.test(candidate)) {
        break;
      }
      titleLines.unshift(candidate);
      titleStart = index;
    }

    const title = cleanItemTitle(titleLines.join(" "));
    if (!title || isSectionTitle(title)) return [];
    return [{ lineIndex, titleStart, title }];
  });

  return recommendations.flatMap((recommendation, recommendationIndex) => {
    let actionEnd = recommendations[recommendationIndex + 1]?.titleStart ?? lines.length;
    for (let index = recommendation.lineIndex + 1; index < actionEnd; index += 1) {
      if (isSectionTitle(lines[index].trim())) {
        actionEnd = index;
        break;
      }
    }

    const actionBlock = lines.slice(recommendation.lineIndex, actionEnd).join("\n");
    const report = bestStaffReport(recommendation.title, staffReports);
    const action = extractRecommendation(actionBlock) || report?.action || null;
    const sectionTitle = precedingSectionTitle(lines, recommendation.titleStart);
    const duplicate = existingItems.some(
      (item) =>
        item.title && agendaItemSimilarity(recommendation.title, item.title) >= 0.75
    );
    if (duplicate) return [];

    return [
      {
        externalId: `${meeting.externalId || slugify(meeting.title)}-item-${slugify(recommendation.title)}`,
        fileNumber: null,
        agendaNumber: null,
        itemType: sectionTitle,
        title: recommendation.title,
        action,
        result: null,
        sourceUrl: meeting.sourceUrl || meeting.source || "",
        rowText: cleanText(
          `${sectionTitle ? `Agenda section: ${sectionTitle}. ` : ""}${recommendation.title} Recommendation: ${action || "Not listed in the source document."}${
            report ? ` Linked staff report context: ${report.rowText}` : ""
          }`
        ).slice(0, 7000),
        attachments: meeting.documents.filter(
          (document) =>
            document.agendaItemTitle &&
            agendaItemSimilarity(recommendation.title, document.agendaItemTitle) >= 0.6
        )
      } satisfies AgendaItem
    ];
  });
}

export function extractAgendaItemsFromText(meeting: PrimeGovMeeting, text: string): AgendaItem[] {
  const agendaText = currentAgendaSection(text);
  const staffReports = staffReportSections(text);
  const items: AgendaItem[] = [];
  const hasNumberedOpening = /\b1\s*[.):-]\s*(?:call to order|roll call|opening remarks?)\b/i.test(
    agendaText
  );
  let lastWholeNumber = 0;
  ITEM_START.lastIndex = 0;

  for (const match of agendaText.matchAll(ITEM_START)) {
    const agendaNumber = match[1].toUpperCase();
    if (!/^[A-Z]/.test(match[2].trimStart())) continue;
    if (/^\d+$/.test(agendaNumber)) {
      if (!hasNumberedOpening) continue;
      const wholeNumber = Number(agendaNumber);
      if (wholeNumber <= lastWholeNumber) continue;
      lastWholeNumber = wholeNumber;
    }
    const rawBlock = match[2];
    const block = cleanText(rawBlock);
    const title = cleanItemTitle(rawBlock);
    if (!title || isSectionTitle(title)) continue;
    const report = bestStaffReport(title, staffReports);
    const action = extractRecommendation(block) || report?.action || null;
    const sectionTitle = sectionTitleAtOffset(agendaText, match.index || 0);
    items.push({
      externalId: `${meeting.externalId || slugify(meeting.title)}-item-${slugify(agendaNumber)}`,
      fileNumber: null,
      agendaNumber,
      itemType: sectionTitle,
      title,
      action,
      result: null,
      sourceUrl: meeting.sourceUrl || meeting.source || "",
      rowText: cleanText(
        `${sectionTitle ? `Agenda section: ${sectionTitle}. ` : ""}${agendaNumber} ${block}${report ? ` Linked staff report context: ${report.rowText}` : ""}`
      ).slice(0, 7000),
      attachments: meeting.documents.filter(
        (document) => document.agendaItemNumber === agendaNumber
      )
    });
  }

  return [...items, ...unnumberedAgendaItems(meeting, agendaText, staffReports, items)];
}

export function mergeAgendaItems(existing: AgendaItem[] = [], extracted: AgendaItem[] = []) {
  const merged = new Map<string, AgendaItem>();
  for (const item of [...existing, ...extracted]) {
    const key = item.agendaNumber || item.externalId;
    const prior = merged.get(key);
    if (!prior) {
      merged.set(key, item);
      continue;
    }
    merged.set(key, {
      ...prior,
      title: prior.title || item.title,
      action: prior.action || item.action,
      result: prior.result || item.result,
      rowText: prior.rowText.length >= item.rowText.length ? prior.rowText : item.rowText,
      attachments: [...(prior.attachments || []), ...(item.attachments || [])]
    });
  }
  return Array.from(merged.values());
}

export function formatAgendaItemContexts(items: AgendaItem[]) {
  if (!items.length) return "";
  return [
    "Current meeting agenda items (use each block only for its named item):",
    ...items.map((item) => {
      const title = cleanText(item.title || "").slice(0, 500);
      const action = cleanText(item.action || item.recommendedAction || "").slice(0, 2500);
      const itemContext = cleanText(item.rowText || "").slice(0, 7000);
      const linkedContext = cleanText(
        (item.attachments || [])
          .map((document) => document.extractedText || "")
          .filter(Boolean)
          .join(" ")
      ).slice(0, 2500);
      return [
        `Agenda item ${item.agendaNumber || "Unnumbered"}`,
        `Agenda section: ${item.itemType || "Not listed in the source document."}`,
        `Official title: ${title || "Not listed in the source document."}`,
        `Recommended action: ${action || "Not listed in the source document."}`,
        `Item context: ${itemContext || "Not listed in the source document."}`,
        ...(linkedContext ? [`Linked supporting-report context: ${linkedContext}`] : []),
        `Official source: ${item.sourceUrl}`
      ].join("\n");
    })
  ].join("\n\n");
}

export function findAgendaItemForCard(title: string, items: AgendaItem[] = []) {
  let best: { item: AgendaItem; score: number } | null = null;
  for (const item of items) {
    const candidate = item.title || item.rowText;
    if (!candidate) continue;
    const score = agendaItemSimilarity(title, candidate);
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= 0.6 ? best.item : null;
}
