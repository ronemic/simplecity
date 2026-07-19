import "@/lib/env/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getJurisdictionBySlug,
  getServiceSupabaseClientForJurisdiction
} from "@/lib/config/jurisdictions";
import {
  setMeetingSummarizedSourceHash,
  upsertMeetings,
  writeAuditLog
} from "@/lib/db/upsertMeetings";
import { meetingTranslationFingerprint } from "@/lib/db/translationFingerprint";
import type { LlmReadyMeeting } from "@/lib/types";

const EXECUTE = process.argv.includes("--execute");

const MEETING_IDS = {
  february: "0b18ea9f-3e4c-4312-8ec0-8d42f6a32f04",
  june: "da18eb77-7da5-462f-93fe-2b1a90910500",
  training: "7c904bbf-0dd3-449d-9b12-32778f5bfef2",
  cancellation: "2cdea392-8cab-48c5-a42b-8c01c5fa8119"
} as const;

const EXTERNAL_IDS = {
  february:
    "menlo-park-official-site-complete-streets-commission-feb-11-2026-agenda-20260211-csc-agenda-pdf",
  june:
    "menlo-park-official-site-complete-streets-commission-june-10-2026-agenda-20260610-csc-agenda-original-pdf",
  training:
    "menlo-park-official-site-complete-streets-commission-june-29-2026-special-event-notice-20260629-city-council-and-commissions-committees-special-joint-event-training-pdf",
  cancellation:
    "menlo-park-official-site-complete-streets-commission-july-8-2026-cancellation-notice-20260708-csc-cancellation-notice-pdf"
} as const;

const SOURCE_URLS = {
  februaryAgenda:
    "https://www.menlopark.gov/files/sharedassets/public/v/1/agendas-and-minutes/complete-streets-commission/2026-meetings/agendas/20260211-csc-agenda.pdf",
  februaryMinutes:
    "https://www.menlopark.gov/files/sharedassets/public/v/1/agendas-and-minutes/complete-streets-commission/2026-meetings/minutes/20250211-csc-regular-minutes_final.pdf",
  februaryVideo: "https://youtu.be/RwEGaCbJ2A0",
  juneAgenda:
    "https://www.menlopark.gov/files/sharedassets/public/v/1/agendas-and-minutes/complete-streets-commission/2026-meetings/agendas/20260610-csc-agenda_original.pdf",
  juneVideo: "https://youtu.be/IrGkJk7LDww",
  training:
    "https://www.menlopark.gov/files/sharedassets/public/v/1/agendas-and-minutes/special-event-notices/2026/20260629-city-council-and-commissions-committees-special-joint-event-training.pdf",
  cancellation:
    "https://www.menlopark.gov/files/sharedassets/public/v/1/agendas-and-minutes/complete-streets-commission/2026-meetings/agendas/20260708-csc-cancellation-notice.pdf"
} as const;

const TARGET_MEETING_BY_SOURCE_URL = new Map<string, string>([
  [SOURCE_URLS.februaryAgenda, MEETING_IDS.february],
  [SOURCE_URLS.februaryMinutes, MEETING_IDS.february],
  [SOURCE_URLS.februaryVideo, MEETING_IDS.february],
  [SOURCE_URLS.juneAgenda, MEETING_IDS.june],
  [SOURCE_URLS.juneVideo, MEETING_IDS.june],
  [SOURCE_URLS.training, MEETING_IDS.training],
  [SOURCE_URLS.cancellation, MEETING_IDS.cancellation]
]);

const KEPT_CARD_IDS = new Set([
  // February agenda cards and their verified February decision outcomes.
  "80f693ff-3563-49c7-84c2-2f011c74e823",
  "f9aaf4e1-ec6f-4165-b69c-c96893e3f5bb",
  "7f16f9a5-69a9-4d68-96d3-f99acc41bf43",
  "648f966f-d105-4598-a6d0-8830254ada12",
  // The four current items listed by the official June 10 agenda.
  "4c28db9c-f89a-47ee-8759-cb2665ea7dfe",
  "8e6d08c6-b29a-4b62-9094-c3b7d672e7f2",
  "64289f36-7c95-4308-a38d-12717c2582e8",
  "1db05b7f-6073-4335-913b-8fb14d91a78f",
  // Canonical special-event and cancellation cards.
  "30656cd1-cf49-4497-952c-15ead294deaf",
  "470f2346-a8e3-4a45-9faa-0cfe986892cc"
]);

type MeetingSnapshot = {
  id: string;
  external_id: string | null;
  title: string;
  date_text: string | null;
  meeting_type: string | null;
  source_url: string | null;
  raw: unknown;
};

type CardSnapshot = {
  id: string;
  meeting_id: string | null;
  agenda_item: string | null;
  source_url: string | null;
};

function requireNoError(error: { message: string } | null, message: string) {
  if (error) throw new Error(`${message}: ${error.message}`);
}

async function loadRepairSourceMeetings() {
  const inputPath = path.join(
    process.cwd(),
    "scraped-primegov",
    "menlo-park",
    "pipeline-result.json"
  );
  const parsed = JSON.parse(await fs.readFile(inputPath, "utf8")) as {
    meetings?: LlmReadyMeeting[];
  };
  const wanted = new Set(Object.values(EXTERNAL_IDS));
  const meetings = (parsed.meetings || []).filter((meeting) =>
    wanted.has(String(meeting.externalId) as (typeof EXTERNAL_IDS)[keyof typeof EXTERNAL_IDS])
  );

  if (meetings.length !== wanted.size) {
    throw new Error(
      `Expected ${wanted.size} canonical repair meetings in ${inputPath}, found ${meetings.length}.`
    );
  }
  return meetings;
}

async function main() {
  const jurisdiction = getJurisdictionBySlug("menlo-park");
  if (!jurisdiction) throw new Error("Menlo Park jurisdiction is not configured.");
  const supabase = getServiceSupabaseClientForJurisdiction("menlo-park");
  const meetingIds = Object.values(MEETING_IDS);

  const [meetingResult, documentResult, cardResult, outcomeResult, meetingTranslationResult] =
    await Promise.all([
      supabase
        .from("meetings")
        .select("id,external_id,title,date_text,meeting_type,source_url,raw")
        .in("id", meetingIds),
      supabase.from("documents").select("*").in("meeting_id", meetingIds),
      supabase.from("summary_cards").select("*").in("meeting_id", meetingIds),
      supabase.from("decision_outcomes").select("*").in("meeting_id", meetingIds),
      supabase.from("meeting_translations").select("*").in("meeting_id", meetingIds)
    ]);

  requireNoError(meetingResult.error, "Failed to load affected meetings");
  requireNoError(documentResult.error, "Failed to load affected documents");
  requireNoError(cardResult.error, "Failed to load affected cards");
  requireNoError(outcomeResult.error, "Failed to load affected outcomes");
  requireNoError(meetingTranslationResult.error, "Failed to load affected meeting translations");

  const meetings = (meetingResult.data || []) as MeetingSnapshot[];
  const cards = (cardResult.data || []) as CardSnapshot[];
  if (meetings.length !== meetingIds.length) {
    throw new Error(`Expected ${meetingIds.length} affected meetings, found ${meetings.length}.`);
  }

  for (const [key, expectedId] of Object.entries(MEETING_IDS)) {
    const meeting = meetings.find((row) => row.id === expectedId);
    const expectedExternalId = EXTERNAL_IDS[key as keyof typeof EXTERNAL_IDS];
    if (!meeting || meeting.external_id !== expectedExternalId) {
      throw new Error(`Meeting identity precondition failed for ${key}.`);
    }
  }

  const unknownCards = cards.filter(
    (card) => !card.source_url || !TARGET_MEETING_BY_SOURCE_URL.has(card.source_url)
  );
  if (unknownCards.length > 0) {
    throw new Error(
      `Refusing repair because ${unknownCards.length} affected card(s) have unknown source URLs.`
    );
  }

  const missingKeptCards = Array.from(KEPT_CARD_IDS).filter(
    (id) => !cards.some((card) => card.id === id)
  );
  if (missingKeptCards.length > 0) {
    throw new Error(`Refusing repair because canonical cards are missing: ${missingKeptCards.join(", ")}`);
  }

  const duplicateCardIds = cards
    .filter((card) => !KEPT_CARD_IDS.has(card.id))
    .map((card) => card.id);
  const keptCardMoves = cards
    .filter((card) => KEPT_CARD_IDS.has(card.id))
    .map((card) => ({
      id: card.id,
      from: card.meeting_id,
      to: TARGET_MEETING_BY_SOURCE_URL.get(String(card.source_url)) || null
    }))
    .filter((move) => move.to && move.from !== move.to);

  const plan = {
    execute: EXECUTE,
    meetingsToRestore: Object.values(EXTERNAL_IDS),
    documentsToReassign: (documentResult.data || []).filter((document) => {
      const target = TARGET_MEETING_BY_SOURCE_URL.get(String(document.source_url || ""));
      return target && target !== document.meeting_id;
    }).map((document) => ({ id: document.id, from: document.meeting_id, to: TARGET_MEETING_BY_SOURCE_URL.get(document.source_url) })),
    keptCardMoves,
    duplicateCardIds,
    outcomesPreserved: (outcomeResult.data || []).map((outcome) => outcome.id),
    februaryTranslationRestored: true
  };

  console.log(JSON.stringify(plan, null, 2));
  if (!EXECUTE) {
    console.log("Dry run only. Pass --execute to apply this validated repair.");
    return;
  }

  const backupPath = path.join(
    "/tmp",
    `simplecity-menlo-park-meeting-collision-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        meetings: meetingResult.data,
        documents: documentResult.data,
        cards: cardResult.data,
        outcomes: outcomeResult.data,
        meetingTranslations: meetingTranslationResult.data
      },
      null,
      2
    )
  );

  const repairMeetings = await loadRepairSourceMeetings();
  const upserted = await upsertMeetings(
    supabase,
    repairMeetings,
    new Date().toISOString(),
    jurisdiction
  );

  for (const move of keptCardMoves) {
    const { error } = await supabase
      .from("summary_cards")
      .update({ meeting_id: move.to })
      .eq("id", move.id)
      .eq("meeting_id", move.from);
    requireNoError(error, `Failed to move canonical card ${move.id}`);
  }

  for (const outcome of outcomeResult.data || []) {
    const card = cards.find((candidate) => candidate.id === outcome.summary_card_id);
    const targetMeetingId = card?.source_url
      ? TARGET_MEETING_BY_SOURCE_URL.get(card.source_url)
      : null;
    if (!targetMeetingId) {
      throw new Error(`Unable to resolve the target meeting for outcome ${outcome.id}.`);
    }
    if (outcome.meeting_id === targetMeetingId) continue;

    const { error } = await supabase
      .from("decision_outcomes")
      .update({ meeting_id: targetMeetingId })
      .eq("id", outcome.id)
      .eq("meeting_id", outcome.meeting_id);
    requireNoError(error, `Failed to move decision outcome ${outcome.id}`);
  }

  if (duplicateCardIds.length > 0) {
    const { error } = await supabase
      .from("summary_cards")
      .delete()
      .in("id", duplicateCardIds);
    requireNoError(error, "Failed to delete duplicate collision cards");
  }

  const februaryMeeting = repairMeetings.find(
    (meeting) => meeting.externalId === EXTERNAL_IDS.february
  );
  if (!februaryMeeting) throw new Error("Canonical February meeting is missing from repair input.");
  const februaryMeetingTranslation = {
    meeting_id: MEETING_IDS.february,
    locale: "es",
    title: "Comisión de Calles Completas - 11 de febrero de 2026",
    meeting_type: "Comisión de Calles Completas",
    source_fingerprint: meetingTranslationFingerprint({
      title: februaryMeeting.title,
      meeting_type: februaryMeeting.meetingType
    }),
    translation_status: "machine",
    translated_at: new Date().toISOString()
  };
  const { error: translationError } = await supabase
    .from("meeting_translations")
    .upsert(februaryMeetingTranslation, { onConflict: "meeting_id,locale" });
  requireNoError(translationError, "Failed to restore the February meeting translation");

  for (const meeting of upserted) {
    await setMeetingSummarizedSourceHash(supabase, meeting.id, meeting.sourceHash);
  }

  await writeAuditLog(supabase, {
    adminEmail: "codex-repair@simplecity.local",
    action: "repair_menlo_park_meeting_identity_collision",
    entityType: "meeting",
    entityId: MEETING_IDS.february,
    jurisdictionSlug: "menlo-park",
    before: { backupPath, plan },
    after: {
      restoredMeetingIds: upserted.map((meeting) => meeting.id),
      keptCardIds: Array.from(KEPT_CARD_IDS),
      deletedDuplicateCardIds: duplicateCardIds
    }
  });

  const [verifiedMeetings, verifiedDocuments, verifiedCards, verifiedOutcomes] = await Promise.all([
    supabase
      .from("meetings")
      .select("id,external_id,title,date_text,source_url")
      .in("id", meetingIds),
    supabase
      .from("documents")
      .select("id,meeting_id,source_url")
      .in("meeting_id", meetingIds),
    supabase
      .from("summary_cards")
      .select("id,meeting_id,agenda_item,source_url")
      .in("meeting_id", meetingIds),
    supabase
      .from("decision_outcomes")
      .select("id,summary_card_id,meeting_id,decided_at,source_url")
      .in("meeting_id", meetingIds)
  ]);
  for (const [result, label] of [
    [verifiedMeetings, "meetings"],
    [verifiedDocuments, "documents"],
    [verifiedCards, "cards"],
    [verifiedOutcomes, "outcomes"]
  ] as const) {
    requireNoError(result.error, `Failed to verify repaired ${label}`);
  }

  const misplacedDocuments = (verifiedDocuments.data || []).filter(
    (document) =>
      TARGET_MEETING_BY_SOURCE_URL.get(String(document.source_url || "")) !== document.meeting_id
  );
  const misplacedCards = (verifiedCards.data || []).filter(
    (card) => TARGET_MEETING_BY_SOURCE_URL.get(String(card.source_url || "")) !== card.meeting_id
  );
  if (
    verifiedCards.data?.length !== KEPT_CARD_IDS.size ||
    misplacedDocuments.length > 0 ||
    misplacedCards.length > 0
  ) {
    throw new Error("Post-repair verification found remaining collision data.");
  }

  console.log(
    JSON.stringify(
      {
        status: "repaired",
        backupPath,
        meetings: verifiedMeetings.data,
        documents: verifiedDocuments.data,
        cards: verifiedCards.data,
        outcomes: verifiedOutcomes.data
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
