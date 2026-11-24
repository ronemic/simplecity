import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import { loadStoredMeetingsWithDocuments, storeAttachedDocuments } from "@/lib/db/storedMeetingDocuments";
import { extractPdfText } from "@/lib/scraper/pdfText";
import {
  councilMinutesHeader,
  councilMinutesLabel,
  findCouncilMinutesAttachments,
  isSanMateoCouncilMeeting,
  selectCouncilMinutesTarget
} from "@/lib/sources/san-mateo-minutes";
import type { LlmReadyMeeting } from "@/lib/types";
import { isUpcomingMeetingDate } from "@/lib/utils/date";

const LOOKBACK_DAYS = 180;
const DOCUMENT_TYPES = ["HTML Agenda", "Agenda", "Minutes", "Accessible Minutes"];
const MAX_DOWNLOADS_PER_RUN = 12;
const USER_AGENT = "Mozilla/5.0 SimpleCity civic agenda scraper";

export type SanMateoMinutesDependencies = {
  fetchImpl?: typeof fetch;
  /** Text of a downloaded PDF; empty when it has no readable text layer. */
  pdfText?: (bytes: Uint8Array) => Promise<string>;
};

async function pdfTextFromBytes(bytes: Uint8Array) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "simplecity-minutes-"));
  try {
    const file = path.join(directory, "minutes.pdf");
    await writeFile(file, bytes);
    return (await extractPdfText(file))?.text || "";
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function hasReadableMinutes(meeting: LlmReadyMeeting) {
  return meeting.documents.some((document) =>
    ["Minutes", "Accessible Minutes"].includes(document.type) && Boolean(document.extractedText?.trim())
  );
}

function htmlAgendaUrl(meeting: LlmReadyMeeting) {
  const document = meeting.documents.find((candidate) => candidate.type === "HTML Agenda");
  if (document?.url) return document.url;
  return /\/Portal\/Meeting\?/i.test(meeting.sourceUrl || "") ? meeting.sourceUrl : null;
}

/**
 * San Mateo posts City Council minutes on the meeting itself months late, but
 * the drafts are attached to a later agenda's "City Council Meeting Minutes —
 * Approval" item well before that. Read those attachments from the agendas of
 * stored council meetings that have already happened (so the drafts have been
 * acted on), attach each to the one meeting it records, and return the
 * meetings that gained minutes, ready for outcome reconciliation.
 */
export async function attachSanMateoCouncilMinutesFromLaterAgendas(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  log: (message: string) => void = () => undefined,
  dependencies: SanMateoMinutesDependencies = {}
) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const pdfText = dependencies.pdfText || pdfTextFromBytes;
  const meetings = (await loadStoredMeetingsWithDocuments(supabase, jurisdiction, {
    lookbackDays: LOOKBACK_DAYS,
    documentTypes: DOCUMENT_TYPES
  })).filter(isSanMateoCouncilMeeting);

  const missingMinutes = meetings.filter(
    (meeting) => !hasReadableMinutes(meeting) && !isUpcomingMeetingDate(meeting.dateText)
  );
  if (missingMinutes.length === 0) return [];

  const agendas = meetings
    .filter((meeting) => !isUpcomingMeetingDate(meeting.dateText))
    .map((meeting) => ({ meeting, url: htmlAgendaUrl(meeting) }))
    .filter((agenda): agenda is { meeting: LlmReadyMeeting; url: string } => Boolean(agenda.url))
    // A deterministic order, so a revised agenda never flips which copy wins.
    .sort((left, right) => left.url.localeCompare(right.url));

  const gained: LlmReadyMeeting[] = [];
  let downloads = 0;
  for (const agenda of agendas) {
    if (gained.length === missingMinutes.length || downloads >= MAX_DOWNLOADS_PER_RUN) break;
    let html: string;
    try {
      const response = await fetchImpl(agenda.url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) continue;
      html = await response.text();
    } catch {
      continue;
    }

    for (const attachment of findCouncilMinutesAttachments(html, agenda.url)) {
      const target = selectCouncilMinutesTarget(meetings, attachment);
      if (!target) {
        log(`San Mateo ${attachment.label} on the ${agenda.meeting.dateText} agenda matched no single stored City Council meeting; not attached.`);
        continue;
      }
      if (target === agenda.meeting || hasReadableMinutes(target)) continue;
      if (downloads >= MAX_DOWNLOADS_PER_RUN) break;
      downloads += 1;

      let text: string;
      try {
        const response = await fetchImpl(attachment.url, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(60_000)
        });
        if (!response.ok) continue;
        text = await pdfText(new Uint8Array(await response.arrayBuffer()));
      } catch {
        continue;
      }
      if (!text.trim()) {
        log(`San Mateo ${attachment.label} has no readable text; not attached.`);
        continue;
      }
      const header = councilMinutesHeader(text);
      if (!header || header.day !== attachment.day || header.kind !== attachment.kind) {
        log(`San Mateo ${attachment.label} does not open with matching City Council minutes; not attached.`);
        continue;
      }

      const document = {
        type: "Minutes" as const,
        label: councilMinutesLabel(attachment.day, attachment.kind, agenda.meeting.dateText || ""),
        url: attachment.url,
        extractedText: text,
        extractionCharacterCount: text.length,
        isScanned: false
      };
      target.documents.push(document);
      target.hasPdf = true;
      await storeAttachedDocuments(supabase, jurisdiction, target, [document]);
      log(`Stored ${document.label} on the ${target.dateText} ${target.title} meeting.`);
      gained.push({ ...target, status: "Past" });
    }
  }
  return gained;
}
