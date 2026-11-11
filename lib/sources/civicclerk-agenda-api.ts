import fs from "node:fs/promises";
import path from "node:path";
import type { AgendaItem, PrimeGovDocument, PrimeGovMeeting } from "@/lib/types";
import { getJurisdictionDocumentsDir } from "@/lib/scraper/downloadDocuments";

/**
 * CivicClerk's public portal renders each agenda from its public API: the
 * event names the agenda, and /v1/Meetings/{agendaId} returns the numbered item
 * tree with every item's attachments. Carpinteria's files page sometimes lists
 * no item groups at all (its October 12, 2026 council meeting), which left the
 * pipeline to guess items from PDF line breaks. The API is the portal's own
 * structured source, so read items and attachments from it instead.
 */
type ApiAttachment = { id: number; fileName?: string | null; pdfVersionFullPath?: string | null };
type ApiItem = {
  id: number;
  agendaObjectItemOutlineNumber?: string | null;
  agendaObjectItemName?: string | null;
  isSection?: number | null;
  attachmentsList?: ApiAttachment[] | null;
  childItems?: ApiItem[] | null;
};

const MAX_ATTACHMENT_BYTES = 60 * 1024 * 1024;
/** Sections whose items are ceremony, reports or another body's business, not Council decisions. */
const NON_DECISION_SECTION = /proclamation|presentation|introduction|public information|announcement|city manager'?s report|planning commission actions|library board|committee reports|adjourn|roll call|call to order|pledge|public comment/i;
const CLOSED_SESSION = /closed session/i;

function plainText(html?: string | null) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([\da-f]+);|&#(\d+);|&([a-z]+);/gi, (entity, hex?: string, decimal?: string, named?: string) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (decimal) return String.fromCodePoint(Number(decimal));
      return ({
        nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", rsquo: "’", lsquo: "‘",
        ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…"
      } as Record<string, string>)[String(named).toLowerCase()] || entity;
    })
    .replace(/[ \s]+/g, " ")
    .trim();
}

export function civicClerkApiBase(portalUrl: string) {
  const portal = new URL(portalUrl);
  if (!portal.hostname.endsWith(".portal.civicclerk.com")) {
    throw new Error(`Not a CivicClerk portal URL: ${portalUrl}`);
  }
  return `https://${portal.hostname.replace(".portal.", ".api.")}/v1`;
}

function isSignedCivicClerkBlob(value?: string | null) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname === "civicclerk.blob.core.windows.net";
  } catch {
    return false;
  }
}

/**
 * Turn the API's agenda tree into official items, keeping each item's section.
 * `downloadUrls` holds short-lived signed blob URLs keyed by the public portal
 * attachment URL; they grant write access, so they are used once and never stored.
 */
export function civicClerkItemsFromAgenda(
  tree: ApiItem[],
  options: { portalUrl: string; eventId: string; meetingExternalId: string }
): { items: AgendaItem[]; downloadUrls: Map<string, string> } {
  const items: AgendaItem[] = [];
  const downloadUrls = new Map<string, string>();
  const portal = options.portalUrl.replace(/\/$/, "");

  const visit = (nodes: ApiItem[], section: string | null) => {
    for (const node of nodes) {
      const name = plainText(node.agendaObjectItemName);
      const number = String(node.agendaObjectItemOutlineNumber || "").trim().replace(/\.$/, "");
      if (node.isSection || !number) {
        visit(node.childItems || [], name.replace(/[:.]\s*$/, "") || section);
        continue;
      }
      const attachments: PrimeGovDocument[] = (node.attachmentsList || []).map((attachment) => {
        const url = `${portal}/event/${options.eventId}/files/attachment/${attachment.id}`;
        if (isSignedCivicClerkBlob(attachment.pdfVersionFullPath)) {
          downloadUrls.set(url, String(attachment.pdfVersionFullPath));
        }
        const label = plainText(attachment.fileName) || `Agenda Item No. ${number} attachment`;
        return {
          type: /staff report/i.test(label) ? "Staff Report" : "Attachment",
          label,
          url,
          parentDocumentUrl: `${portal}/event/${options.eventId}/files`,
          agendaItemNumber: number,
          agendaItemTitle: name,
          isAgendaItemAttachment: true
        };
      });
      const closed = section ? CLOSED_SESSION.test(section) : false;
      items.push({
        externalId: `${options.meetingExternalId}-item-${number.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        fileNumber: null,
        agendaNumber: number,
        itemType: closed ? "Closed Session"
          : section && NON_DECISION_SECTION.test(section) ? "Section Heading"
            : section,
        title: name,
        action: null,
        result: null,
        sourceUrl: `${portal}/event/${options.eventId}/files`,
        rowText: [section ? `${section}:` : "", `${number}. ${name}`].filter(Boolean).join(" "),
        attachments
      });
      visit(node.childItems || [], section);
    }
  };
  visit(tree, null);
  return { items, downloadUrls };
}

async function fetchJson<T>(url: string): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 SimpleCity CivicClerk agenda scraper" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as T;
    } catch (error) {
      failure = error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`CivicClerk API request failed: ${url}`, { cause: failure });
}

async function downloadAttachment(signedUrl: string, target: string) {
  if (!isSignedCivicClerkBlob(signedUrl)) throw new Error("Attachment is not hosted by CivicClerk.");
  const response = await fetch(signedUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > MAX_ATTACHMENT_BYTES) throw new Error(`Attachment is too large (${declared} bytes).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_ATTACHMENT_BYTES || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("Attachment was not a usable PDF.");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(`${target}.tmp`, bytes);
  await fs.rename(`${target}.tmp`, target);
}

export async function enrichCivicClerkItemsFromApi(meetings: PrimeGovMeeting[], options: {
  portalUrl: string;
  jurisdictionSlug: string;
  documentOutputDir?: string;
  downloadDocuments?: boolean;
  log?: (message: string) => void;
  shouldStop?: () => boolean;
}) {
  const log = options.log || (() => undefined);
  const api = civicClerkApiBase(options.portalUrl);
  const directory = options.documentOutputDir || getJurisdictionDocumentsDir(options.jurisdictionSlug);
  let itemCount = 0;
  let attachmentCount = 0;
  for (const meeting of meetings) {
    if (options.shouldStop?.()) break;
    const eventId = meeting.externalId?.match(/event-(\d+)$/)?.[1];
    if (!eventId || meeting.status === "Cancelled") continue;
    let result: ReturnType<typeof civicClerkItemsFromAgenda> | null = null;
    try {
      const event = await fetchJson<{ agendaId?: number }>(`${api}/Events/${eventId}`);
      if (!event.agendaId) continue; // agenda not published yet
      const agenda = await fetchJson<{ items?: ApiItem[]; agendaIsPublish?: boolean }>(`${api}/Meetings/${event.agendaId}`);
      // Never turn a draft agenda into public cards.
      if (agenda.agendaIsPublish !== true) continue;
      result = civicClerkItemsFromAgenda(agenda.items || [], {
        portalUrl: options.portalUrl,
        eventId,
        meetingExternalId: meeting.externalId || `event-${eventId}`
      });
    } catch (error) {
      log(`CivicClerk agenda API failed for ${meeting.title} ${meeting.dateText}: ${error instanceof Error ? error.message : error}`);
      continue;
    }
    if (result.items.length === 0) continue;

    // The files page's item uploads use attachment IDs that its file endpoint
    // serves as empty placeholders, and their "Agenda Item No. 5" labels were
    // classified as agendas. The API attachments replace them.
    meeting.documents = meeting.documents.filter((document) => !document.isAgendaItemAttachment);
    meeting.items = result.items;
    meeting.agendaItemInventoryComplete = true;
    itemCount += result.items.length;
    for (const item of result.items) {
      for (const attachment of item.attachments || []) {
        meeting.documents.push(attachment);
        attachmentCount += 1;
        const signedUrl = result.downloadUrls.get(attachment.url);
        if (options.downloadDocuments === false || options.shouldStop?.() || !signedUrl) continue;
        const id = attachment.url.match(/attachment\/(\d+)$/)?.[1] || "attachment";
        const target = path.join(directory, `${meeting.externalId}-attachment-${id}.pdf`);
        try {
          await downloadAttachment(signedUrl, target);
          attachment.localPath = target;
        } catch (error) {
          attachment.downloadError = error instanceof Error ? error.message : String(error);
          log(`CivicClerk attachment download failed for ${attachment.label}: ${attachment.downloadError}`);
        }
      }
    }
  }
  log(`CivicClerk agenda API yielded ${itemCount} item(s) and ${attachmentCount} attachment(s).`);
  return itemCount;
}
