import "@/lib/env/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getJurisdictionBySlug,
  getJurisdictions,
  getServiceSupabaseClientForJurisdiction
} from "@/lib/config/jurisdictions";
import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import {
  planDuplicateCardRepair,
  type DuplicateRepairCard
} from "@/lib/db/duplicateCardRepair";
import { writeAuditLog } from "@/lib/db/upsertMeetings";
import type { AgendaItem } from "@/lib/types";

const execute = process.argv.includes("--execute");
const summaryOnly = process.argv.includes("--summary");

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

async function repairJurisdiction(jurisdiction: JurisdictionConfig, meetingId: string | null) {
  const supabase = getServiceSupabaseClientForJurisdiction(jurisdiction.slug);
  let meetingQuery = supabase
    .from("meetings")
    .select("id,title,date_text,raw")
    .eq("jurisdiction_slug", jurisdiction.slug)
    .order("meeting_datetime", { ascending: false, nullsFirst: false });
  meetingQuery = meetingId
    ? meetingQuery.eq("id", meetingId)
    : meetingQuery.limit(500);
  const { data: meetings, error: meetingError } = await meetingQuery;
  if (meetingError) throw new Error(`Failed to load meetings: ${meetingError.message}`);

  const plans = [];
  for (const meeting of meetings || []) {
    const items = ((meeting.raw as { items?: AgendaItem[] } | null)?.items || []);
    if (items.length === 0) continue;

    const cardColumns = [
      "id",
      ...(execute ? ["source_item_id"] : []),
      "agenda_item",
      "source_url",
      "what_is_happening",
      "created_at"
    ].join(",");
    const [{ data: cards, error: cardError }, { data: outcomes, error: outcomeError }] =
      await Promise.all([
        supabase.from("summary_cards").select(cardColumns).eq("meeting_id", meeting.id),
        supabase.from("decision_outcomes").select("summary_card_id").eq("meeting_id", meeting.id)
      ]);
    if (cardError) throw new Error(`Failed to load cards: ${cardError.message}`);
    if (outcomeError) throw new Error(`Failed to load outcomes: ${outcomeError.message}`);

    const plan = planDuplicateCardRepair(
      (cards || []) as unknown as DuplicateRepairCard[],
      items,
      new Set((outcomes || []).map((outcome) => outcome.summary_card_id))
    );
    const duplicateCount = plan.groups.reduce(
      (total, group) => total + group.duplicateCardIds.length,
      0
    );
    if (duplicateCount === 0 && plan.groups.length === 0) continue;
    plans.push({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        date: meeting.date_text
      },
      cardsChecked: cards?.length || 0,
      sourceItemsMatched: plan.groups.length,
      duplicateCardsToDelete: duplicateCount,
      unmatchedCards: plan.unmatchedCardIds.length,
      ambiguousSourceItemIds: plan.ambiguousSourceItemIds,
      groups: plan.groups
    });
  }

  const outputPlans = summaryOnly
    ? plans.map((plan) => ({
        meeting: plan.meeting,
        cardsChecked: plan.cardsChecked,
        sourceItemsMatched: plan.sourceItemsMatched,
        duplicateCardsToDelete: plan.duplicateCardsToDelete,
        unmatchedCards: plan.unmatchedCards,
        ambiguousSourceItemIds: plan.ambiguousSourceItemIds
      }))
    : plans;
  console.log(JSON.stringify({ execute, jurisdiction: jurisdiction.slug, plans: outputPlans }, null, 2));
  if (!execute) {
    return {
      jurisdiction: jurisdiction.slug,
      meetings: plans.length,
      duplicateCards: plans.reduce((total, plan) => total + plan.duplicateCardsToDelete, 0),
      unmatchedCards: plans.reduce((total, plan) => total + plan.unmatchedCards, 0)
    };
  }

  const ambiguous = plans.flatMap((plan) => plan.ambiguousSourceItemIds);
  if (ambiguous.length > 0) {
    throw new Error(`Refusing repair with ambiguous outcome groups: ${ambiguous.join(", ")}`);
  }

  const backupPath = path.join(
    "/tmp",
    `simplecity-summary-card-repair-${jurisdiction.slug}-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`
  );
  await fs.writeFile(backupPath, JSON.stringify({ capturedAt: new Date().toISOString(), plans }, null, 2));

  for (const plan of plans) {
    for (const group of plan.groups) {
      if (group.outcomeCardId && group.outcomeCardId !== group.survivorCardId) {
        const { error } = await supabase
          .from("decision_outcomes")
          .update({ summary_card_id: group.survivorCardId })
          .eq("summary_card_id", group.outcomeCardId);
        if (error) throw new Error(`Failed to preserve decision outcome: ${error.message}`);
      }
      if (group.duplicateCardIds.length > 0) {
        const { error } = await supabase
          .from("summary_cards")
          .delete()
          .in("id", group.duplicateCardIds);
        if (error) throw new Error(`Failed to delete duplicate cards: ${error.message}`);
      }
      const { error } = await supabase
        .from("summary_cards")
        .update({ source_item_id: group.sourceItemId })
        .eq("id", group.survivorCardId);
      if (error) throw new Error(`Failed to assign source item identity: ${error.message}`);
    }

    await writeAuditLog(supabase, {
      adminEmail: "system:repair-duplicate-summary-cards",
      action: "repair_duplicate_summary_cards",
      entityType: "meeting",
      entityId: plan.meeting.id,
      jurisdictionSlug: jurisdiction.slug,
      after: {
        duplicateCardsDeleted: plan.duplicateCardsToDelete,
        sourceItemsMatched: plan.sourceItemsMatched,
        backupPath
      }
    });
  }

  console.log(`Repair complete. Recovery plan: ${backupPath}`);
  return {
    jurisdiction: jurisdiction.slug,
    meetings: plans.length,
    duplicateCards: plans.reduce((total, plan) => total + plan.duplicateCardsToDelete, 0),
    unmatchedCards: plans.reduce((total, plan) => total + plan.unmatchedCards, 0)
  };
}

async function main() {
  const requestedJurisdiction = argument("jurisdiction") || "all";
  const meetingId = argument("meeting-id");
  if (meetingId && requestedJurisdiction === "all") {
    throw new Error("Use --meeting-id only with a specific --jurisdiction.");
  }

  const jurisdictions = requestedJurisdiction === "all"
    ? getJurisdictions()
    : [getJurisdictionBySlug(requestedJurisdiction)].filter(
        (jurisdiction): jurisdiction is JurisdictionConfig => Boolean(jurisdiction)
      );
  if (jurisdictions.length === 0) {
    throw new Error(`Unknown jurisdiction: ${requestedJurisdiction}`);
  }

  const reports = [];
  for (const jurisdiction of jurisdictions) {
    reports.push(await repairJurisdiction(jurisdiction, meetingId));
  }
  console.log(JSON.stringify({ execute, scope: requestedJurisdiction, reports }, null, 2));
  if (!execute) {
    console.log("Dry run only. Apply the source_item_id migration, inspect the plans, then pass --execute.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
