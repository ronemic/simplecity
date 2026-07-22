import type {
  AgendaItem,
  DocumentType,
  PrimeGovDocument,
  PrimeGovMeeting
} from "@/lib/types";
import { cleanText, slugify } from "@/lib/utils/slug";

export type DiscoveredAttachment = {
  label: string;
  url: string;
  type?: DocumentType;
};

export type DiscoveredAgendaItemAttachments = {
  agendaNumber: string | null;
  title: string | null;
  rowText?: string | null;
  sourceUrl?: string | null;
  attachments: DiscoveredAttachment[];
};

export function classifyAgendaItemAttachment(label = "", url = ""): DocumentType {
  const value = `${label} ${url}`.toLowerCase();
  if (/staff\s*(?:report|memo)|agenda\s*report/.test(value)) return "Staff Report";
  if (/public\s*(?:comment|correspondence)|comment\s*letter/.test(value)) {
    return "Public Comment";
  }
  if (/\bresolution\b/.test(value)) return "Resolution";
  if (/\bord(?:inance)?\b|ordinance/.test(value)) return "Ordinance";
  if (/\bcontract\b|agreement/.test(value)) return "Contract";
  if (/\bexhibit\b|\battachment\b|supporting\s*document/.test(value)) return "Exhibit";
  return "Attachment";
}

function normalizedAgendaNumber(value: string | null | undefined) {
  return cleanText(value || "").replace(/[.\s]+$/g, "").toUpperCase();
}

function itemMatches(
  item: AgendaItem,
  discovery: DiscoveredAgendaItemAttachments
) {
  const itemNumber = normalizedAgendaNumber(item.agendaNumber);
  const discoveryNumber = normalizedAgendaNumber(discovery.agendaNumber);
  if (itemNumber && discoveryNumber) return itemNumber === discoveryNumber;

  const itemTitle = cleanText(item.title || "").toLowerCase();
  const discoveryTitle = cleanText(discovery.title || "").toLowerCase();
  return Boolean(itemTitle && discoveryTitle && itemTitle === discoveryTitle);
}

function attachmentDocument(
  meeting: PrimeGovMeeting,
  discovery: DiscoveredAgendaItemAttachments,
  attachment: DiscoveredAttachment
): PrimeGovDocument {
  return {
    jurisdictionName: meeting.jurisdictionName,
    jurisdictionSlug: meeting.jurisdictionSlug,
    platform: meeting.platform,
    type: attachment.type || classifyAgendaItemAttachment(attachment.label, attachment.url),
    label: cleanText(attachment.label) || "Attachment",
    url: attachment.url,
    agendaItemNumber: discovery.agendaNumber,
    agendaItemTitle: discovery.title,
    parentDocumentUrl: discovery.sourceUrl || meeting.meetingDetailsUrl || meeting.sourceUrl || null,
    isAgendaItemAttachment: true
  };
}

export function mergeDiscoveredAgendaItemAttachments(
  meeting: PrimeGovMeeting,
  discoveries: DiscoveredAgendaItemAttachments[]
) {
  const documentsByUrl = new Map(
    meeting.documents.map((document) => [document.url.toLowerCase(), document])
  );
  const items = [...(meeting.items || [])];
  let attachmentsAdded = 0;
  let attachmentsAssociated = 0;

  for (const discovery of discoveries) {
    const attachments: PrimeGovDocument[] = [];
    const seenUrls = new Set<string>();

    for (const candidate of discovery.attachments) {
      const url = candidate.url.trim();
      const key = url.toLowerCase();
      if (!/^https?:/i.test(url) || seenUrls.has(key)) continue;
      seenUrls.add(key);

      let document = documentsByUrl.get(key);
      if (!document) {
        document = attachmentDocument(meeting, discovery, { ...candidate, url });
        meeting.documents.push(document);
        documentsByUrl.set(key, document);
        attachmentsAdded += 1;
      } else {
        document.agendaItemNumber ||= discovery.agendaNumber;
        document.agendaItemTitle ||= discovery.title;
        document.parentDocumentUrl ||=
          discovery.sourceUrl || meeting.meetingDetailsUrl || meeting.sourceUrl || null;
        document.isAgendaItemAttachment = true;
        if (document.type === "Document" || document.type === "Other") {
          document.type = candidate.type || classifyAgendaItemAttachment(candidate.label, url);
        }
      }
      attachments.push(document);
      attachmentsAssociated += 1;
    }

    if (attachments.length === 0) continue;
    const existing = items.find((item) => itemMatches(item, discovery));
    if (existing) {
      const existingUrls = new Set((existing.attachments || []).map((document) => document.url));
      existing.attachments = [
        ...(existing.attachments || []),
        ...attachments.filter((document) => !existingUrls.has(document.url))
      ];
      continue;
    }

    const identity = [
      meeting.externalId || meeting.title,
      discovery.agendaNumber || discovery.title || discovery.sourceUrl || "item"
    ].join("-");
    items.push({
      externalId: slugify(identity),
      fileNumber: null,
      agendaNumber: discovery.agendaNumber,
      itemType: null,
      title: discovery.title,
      action: null,
      result: null,
      sourceUrl: discovery.sourceUrl || meeting.meetingDetailsUrl || meeting.sourceUrl || "",
      rowText: cleanText(discovery.rowText || discovery.title || ""),
      attachments
    });
  }

  meeting.items = items;
  meeting.hasPdf ||= meeting.documents.some((document) =>
    document.isAgendaItemAttachment && !document.downloadError
  );
  return {
    attachmentsAdded,
    attachmentsAssociated,
    itemsWithAttachments: discoveries.filter((item) => item.attachments.length > 0).length
  };
}
