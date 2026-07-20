import "@/lib/env/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getJurisdictionBySlug,
  getServiceSupabaseClientForJurisdiction
} from "@/lib/config/jurisdictions";
import { areLikelySameAgendaItem } from "@/lib/utils/agendaItemIdentity";
import { writeAuditLog } from "@/lib/db/upsertMeetings";

const EXECUTE = process.argv.includes("--execute");

type DuplicateGroupConfig = {
  jurisdictionSlug: "mountain-view" | "santa-clara-county";
  meetingDetailsUrl: string;
  survivorExternalId: string;
  discardLoserChildren?: boolean;
};

const GROUPS: DuplicateGroupConfig[] = [
  {
    jurisdictionSlug: "mountain-view",
    meetingDetailsUrl:
      "https://mountainview.legistar.com/MeetingDetail.aspx?ID=1352183&GUID=3A029A96-97AE-42BF-B462-138F5AC10F9A&Options=info|&Search=",
    survivorExternalId:
      "6-23-2026-5-00-pm-city-council-https-mountainview-legistar-com-meetingdetail-aspx-id-13521",
    // The discarded row was mislabeled as Administrative Zoning Hearing, but its
    // documents and cards are partial duplicates of the official City Council meeting.
    discardLoserChildren: true
  },
  {
    jurisdictionSlug: "santa-clara-county",
    meetingDetailsUrl: "https://sccgov.iqm2.com/Citizens/Detail_Meeting.aspx?ID=17596",
    survivorExternalId:
      "jun-15-2026-1-30-pm-board-of-supervisors-budget-hearing-https-sccgov-iqm2-com-citizens-det"
  },
  {
    jurisdictionSlug: "santa-clara-county",
    meetingDetailsUrl: "https://sccgov.iqm2.com/Citizens/Detail_Meeting.aspx?ID=18202",
    survivorExternalId:
      "jun-16-2026-6-00-pm-airports-commission-regular-meeting-https-sccgov-iqm2-com-citizens-det"
  },
  {
    jurisdictionSlug: "santa-clara-county",
    meetingDetailsUrl: "https://sccgov.iqm2.com/Citizens/Detail_Meeting.aspx?ID=18237",
    survivorExternalId:
      "jun-18-2026-2-00-pm-hiv-commission-prevention-committee-https-sccgov-iqm2-com-citizens-det"
  },
  {
    jurisdictionSlug: "santa-clara-county",
    meetingDetailsUrl: "https://sccgov.iqm2.com/Citizens/Detail_Meeting.aspx?ID=18236",
    survivorExternalId:
      "jun-17-2026-1-00-pm-hiv-commission-executive-committee-https-sccgov-iqm2-com-citizens-deta"
  },
  {
    jurisdictionSlug: "santa-clara-county",
    meetingDetailsUrl: "https://sccgov.iqm2.com/Citizens/Detail_Meeting.aspx?ID=17319",
    survivorExternalId:
      "jun-12-2026-9-00-am-personnel-board-business-meeting-https-sccgov-iqm2-com-citizens-detail"
  }
];

type MeetingRow = {
  id: string;
  external_id: string;
  title: string;
  raw: { meetingDetailsUrl?: string | null } | null;
};

type CardRow = {
  id: string;
  meeting_id: string;
  agenda_item: string | null;
  source_url: string | null;
};

function normalized(value?: string | null) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cardsMatch(left: CardRow, right: CardRow) {
  return (
    normalized(left.agenda_item) === normalized(right.agenda_item) ||
    areLikelySameAgendaItem(left.agenda_item || "", right.agenda_item || "")
  );
}

async function requireRows(
  supabase: SupabaseClient,
  table: string,
  meetingIds: string[]
) {
  const { data, error } = await supabase.from(table).select("*").in("meeting_id", meetingIds);
  if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
  return data || [];
}

async function main() {
  const prepared = [];

  for (const config of GROUPS) {
    const jurisdiction = getJurisdictionBySlug(config.jurisdictionSlug);
    if (!jurisdiction) throw new Error(`Unknown jurisdiction: ${config.jurisdictionSlug}`);
    const supabase = getServiceSupabaseClientForJurisdiction(config.jurisdictionSlug);
    const { data: meetings, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("jurisdiction_slug", config.jurisdictionSlug)
      .eq("raw->>meetingDetailsUrl", config.meetingDetailsUrl);
    if (error) throw new Error(`Failed to load duplicate meetings: ${error.message}`);

    const rows = (meetings || []) as MeetingRow[];
    if (rows.length !== 2) {
      throw new Error(
        `Expected exactly two ${config.jurisdictionSlug} rows for ${config.meetingDetailsUrl}, found ${rows.length}.`
      );
    }
    const survivor = rows.find((row) => row.external_id === config.survivorExternalId);
    const loser = rows.find((row) => row.id !== survivor?.id);
    if (!survivor || !loser) {
      throw new Error(`Canonical survivor precondition failed for ${config.meetingDetailsUrl}.`);
    }

    if (config.jurisdictionSlug === "mountain-view") {
      if (survivor.title !== "City Council" || loser.title !== "Administrative Zoning Hearing") {
        throw new Error("Mountain View title precondition failed; refusing consolidation.");
      }
    }

    const meetingIds = rows.map((row) => row.id);
    const [documents, cards, outcomes, translations] = await Promise.all([
      requireRows(supabase, "documents", meetingIds),
      requireRows(supabase, "summary_cards", meetingIds),
      requireRows(supabase, "decision_outcomes", meetingIds),
      requireRows(supabase, "meeting_translations", meetingIds)
    ]);
    const cardIds = cards.map((card) => card.id);
    const { data: cardTranslations, error: cardTranslationError } = cardIds.length
      ? await supabase
          .from("summary_card_translations")
          .select("*")
          .in("summary_card_id", cardIds)
      : { data: [], error: null };
    if (cardTranslationError) {
      throw new Error(`Failed to load card translations: ${cardTranslationError.message}`);
    }

    const survivorCards = (cards as CardRow[]).filter(
      (card) => card.meeting_id === survivor.id
    );
    const loserCards = (cards as CardRow[]).filter((card) => card.meeting_id === loser.id);
    const duplicateLoserCardIds = config.discardLoserChildren
      ? loserCards.map((card) => card.id)
      : loserCards
          .filter((card) => survivorCards.some((candidate) => cardsMatch(card, candidate)))
          .map((card) => card.id);
    const movableCardIds = config.discardLoserChildren
      ? []
      : loserCards
          .filter((card) => !duplicateLoserCardIds.includes(card.id))
          .map((card) => card.id);

    const outcomeCardIds = new Set(outcomes.map((outcome) => outcome.summary_card_id));
    const deletingOutcomeCards = duplicateLoserCardIds.filter((id) => outcomeCardIds.has(id));
    if (deletingOutcomeCards.length > 0) {
      throw new Error(
        `Refusing to delete duplicate cards with outcomes: ${deletingOutcomeCards.join(", ")}`
      );
    }

    prepared.push({
      config,
      jurisdiction,
      supabase,
      survivor,
      loser,
      documents,
      cards,
      outcomes,
      translations,
      cardTranslations: cardTranslations || [],
      duplicateLoserCardIds,
      movableCardIds
    });
  }

  const plan = prepared.map((entry) => ({
    jurisdiction: entry.config.jurisdictionSlug,
    meetingDetailsUrl: entry.config.meetingDetailsUrl,
    survivor: {
      id: entry.survivor.id,
      externalId: entry.survivor.external_id,
      title: entry.survivor.title
    },
    loser: {
      id: entry.loser.id,
      externalId: entry.loser.external_id,
      title: entry.loser.title
    },
    documentsToMove: entry.config.discardLoserChildren
      ? 0
      : entry.documents.filter((document) => document.meeting_id === entry.loser.id).length,
    cardsToMove: entry.movableCardIds.length,
    cardsToDelete: entry.duplicateLoserCardIds.length,
    outcomesToMove: entry.outcomes.filter(
      (outcome) => outcome.meeting_id === entry.loser.id
    ).length,
    discardLoserChildren: Boolean(entry.config.discardLoserChildren)
  }));

  console.log(JSON.stringify({ execute: EXECUTE, groups: plan }, null, 2));
  if (!EXECUTE) {
    console.log("Dry run only. Pass --execute to consolidate these validated groups.");
    return;
  }

  const backupPath = path.join(
    "/tmp",
    `simplecity-duplicate-meeting-consolidation-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`
  );
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        groups: prepared.map((entry) => ({
          config: entry.config,
          meetings: [entry.survivor, entry.loser],
          documents: entry.documents,
          cards: entry.cards,
          outcomes: entry.outcomes,
          meetingTranslations: entry.translations,
          cardTranslations: entry.cardTranslations
        }))
      },
      null,
      2
    )
  );

  for (const entry of prepared) {
    if (!entry.config.discardLoserChildren) {
      const loserDocuments = entry.documents.filter(
        (document) => document.meeting_id === entry.loser.id
      );
      if (loserDocuments.length > 0) {
        const { error } = await entry.supabase
          .from("documents")
          .update({ meeting_id: entry.survivor.id })
          .in("id", loserDocuments.map((document) => document.id));
        if (error) throw new Error(`Failed to move duplicate documents: ${error.message}`);
      }
    }

    if (entry.duplicateLoserCardIds.length > 0) {
      const { error } = await entry.supabase
        .from("summary_cards")
        .delete()
        .in("id", entry.duplicateLoserCardIds);
      if (error) throw new Error(`Failed to delete duplicate cards: ${error.message}`);
    }

    if (entry.movableCardIds.length > 0) {
      const { error } = await entry.supabase
        .from("summary_cards")
        .update({ meeting_id: entry.survivor.id })
        .in("id", entry.movableCardIds);
      if (error) throw new Error(`Failed to move duplicate cards: ${error.message}`);
    }

    const movableCardIds = new Set(entry.movableCardIds);
    const movableOutcomeIds = entry.outcomes
      .filter((outcome) => movableCardIds.has(outcome.summary_card_id))
      .map((outcome) => outcome.id);
    if (movableOutcomeIds.length > 0) {
      const { error } = await entry.supabase
        .from("decision_outcomes")
        .update({ meeting_id: entry.survivor.id })
        .in("id", movableOutcomeIds);
      if (error) throw new Error(`Failed to move duplicate outcomes: ${error.message}`);
    }

    const { error: deleteError } = await entry.supabase
      .from("meetings")
      .delete()
      .eq("id", entry.loser.id)
      .eq("external_id", entry.loser.external_id);
    if (deleteError) throw new Error(`Failed to delete duplicate meeting: ${deleteError.message}`);

    const { data: verified, error: verifyError } = await entry.supabase
      .from("meetings")
      .select("id,external_id,title")
      .eq("jurisdiction_slug", entry.config.jurisdictionSlug)
      .eq("raw->>meetingDetailsUrl", entry.config.meetingDetailsUrl);
    if (verifyError) throw new Error(`Failed to verify consolidation: ${verifyError.message}`);
    if (
      verified?.length !== 1 ||
      verified[0].id !== entry.survivor.id ||
      verified[0].external_id !== entry.config.survivorExternalId
    ) {
      throw new Error(`Post-consolidation verification failed for ${entry.config.meetingDetailsUrl}.`);
    }

    await writeAuditLog(entry.supabase, {
      adminEmail: "codex-repair@simplecity.local",
      action: "consolidate_duplicate_meeting_identity",
      entityType: "meeting",
      entityId: entry.survivor.id,
      jurisdictionSlug: entry.config.jurisdictionSlug,
      before: { backupPath, plan: plan.find((item) => item.loser.id === entry.loser.id) },
      after: { survivor: verified[0], deletedMeetingId: entry.loser.id }
    });
  }

  console.log(
    JSON.stringify(
      {
        status: "repaired",
        backupPath,
        consolidatedGroups: prepared.length
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
