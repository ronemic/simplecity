import "@/lib/env/bootstrap";
import { getServiceSupabaseClientForJurisdiction } from "@/lib/config/jurisdictions";
import { meetingSourceHash } from "@/lib/db/meetingSourceHash";
import {
  extractMenloParkAgendaTimeText
} from "@/lib/sources/menlo-park";
import type { LlmReadyMeeting } from "@/lib/types";
import { parseMeetingDate } from "@/lib/utils/date";

type BackfillMeeting = {
  id: string;
  title: string;
  date_text: string | null;
  time_text: string | null;
  meeting_datetime: string | null;
  raw: unknown;
  source_hash: string | null;
  summarized_source_hash: string | null;
  cards_generated_at: string | null;
};

type BackfillDocument = {
  meeting_id: string | null;
  type: string | null;
  label: string | null;
  source_url: string | null;
  extracted_text: string | null;
};

const TIME_SOURCE_DOCUMENT_TYPES = new Set([
  "Agenda Packet",
  "Agenda",
  "Notice of Cancellation",
  "Special Event Notice"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function documentRank(document: BackfillDocument) {
  if (document.type === "Agenda Packet") return 0;
  if (document.type === "Agenda") return 1;
  return 2;
}

function groupDocumentsByMeeting(documents: BackfillDocument[]) {
  const grouped = new Map<string, BackfillDocument[]>();

  for (const document of documents) {
    if (!document.meeting_id) continue;
    grouped.set(document.meeting_id, [...(grouped.get(document.meeting_id) || []), document]);
  }

  return grouped;
}

function rawDocumentsForMeeting(row: BackfillMeeting) {
  if (!isRecord(row.raw) || !Array.isArray(row.raw.documents)) return [];

  return row.raw.documents
    .filter(isRecord)
    .map((document): BackfillDocument => ({
      meeting_id: row.id,
      type: typeof document.type === "string" ? document.type : null,
      label: typeof document.label === "string" ? document.label : null,
      source_url: typeof document.url === "string" ? document.url : null,
      extracted_text:
        typeof document.extractedText === "string" ? document.extractedText : null
    }));
}

function findMeetingTime(documents: BackfillDocument[]) {
  const candidates = documents
    .filter((document) => document.type && TIME_SOURCE_DOCUMENT_TYPES.has(document.type))
    .sort((left, right) => documentRank(left) - documentRank(right));

  for (const document of candidates) {
    const timeText = extractMenloParkAgendaTimeText(document.extracted_text);
    if (!timeText) continue;

    return { timeText, document };
  }

  return null;
}

function withUpdatedRaw(
  row: BackfillMeeting,
  timeText: string,
  document: BackfillDocument
) {
  if (!isRecord(row.raw)) {
    return {
      raw: row.raw,
      sourceHash: row.source_hash
    };
  }

  const raw: Record<string, unknown> = {
    ...row.raw,
    timeText
  };
  const note = `Extracted meeting time (${timeText}) from Menlo Park ${String(
    document.type || "agenda"
  ).toLowerCase()} text.`;
  const existingNotes = Array.isArray(raw.extractionNotes)
    ? raw.extractionNotes.filter((item): item is string => typeof item === "string")
    : [];

  raw.extractionNotes = existingNotes.includes(note) ? existingNotes : [...existingNotes, note];

  return {
    raw,
    sourceHash: meetingSourceHash(raw as unknown as LlmReadyMeeting)
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const supabase = getServiceSupabaseClientForJurisdiction("menlo-park");

  const [{ data: meetings, error: meetingsError }, { data: documents, error: documentsError }] =
    await Promise.all([
      supabase
        .from("meetings")
        .select(
          "id,title,date_text,time_text,meeting_datetime,raw,source_hash,summarized_source_hash,cards_generated_at"
        )
        .order("meeting_datetime", { ascending: false, nullsFirst: false }),
      supabase
        .from("documents")
        .select("meeting_id,type,label,source_url,extracted_text")
    ]);

  if (meetingsError) throw new Error(`Failed to load Menlo Park meetings: ${meetingsError.message}`);
  if (documentsError) throw new Error(`Failed to load Menlo Park documents: ${documentsError.message}`);

  const documentsByMeeting = groupDocumentsByMeeting((documents || []) as BackfillDocument[]);
  const examples: Array<{ title: string; timeText: string; meetingDatetime: string }> = [];
  let updated = 0;
  let alreadyHadTime = 0;
  let noAgendaTimeFound = 0;

  for (const row of (meetings || []) as BackfillMeeting[]) {
    if (row.time_text) {
      alreadyHadTime += 1;
      continue;
    }

    const result = findMeetingTime([
      ...(documentsByMeeting.get(row.id) || []),
      ...rawDocumentsForMeeting(row)
    ]);
    if (!result) {
      noAgendaTimeFound += 1;
      continue;
    }

    const meetingDatetime = row.date_text
      ? parseMeetingDate(`${row.date_text} ${result.timeText}`)
      : null;
    if (!meetingDatetime) {
      noAgendaTimeFound += 1;
      continue;
    }

    const { raw, sourceHash } = withUpdatedRaw(row, result.timeText, result.document);
    const update: Record<string, unknown> = {
      time_text: result.timeText,
      meeting_datetime: meetingDatetime,
      raw,
      source_hash: sourceHash
    };

    if (row.summarized_source_hash && row.cards_generated_at && sourceHash) {
      update.summarized_source_hash = sourceHash;
    }

    if (!dryRun) {
      const { error } = await supabase.from("meetings").update(update).eq("id", row.id);
      if (error) throw new Error(`Failed to update ${row.title}: ${error.message}`);
    }

    updated += 1;
    if (examples.length < 10) {
      examples.push({
        title: row.title,
        timeText: result.timeText,
        meetingDatetime
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        updated,
        alreadyHadTime,
        noAgendaTimeFound,
        examples
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
