import "@/lib/env/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getJurisdictionBySlug,
  getServiceSupabaseClientForJurisdiction
} from "@/lib/config/jurisdictions";
import { meetingSourceHash } from "@/lib/db/meetingSourceHash";
import { meetingTranslationFingerprint } from "@/lib/db/translationFingerprint";
import { upsertMeetings, writeAuditLog } from "@/lib/db/upsertMeetings";
import type { LlmReadyMeeting } from "@/lib/types";
import { areLikelySameAgendaItem } from "@/lib/utils/agendaItemIdentity";
import { parseMeetingDate } from "@/lib/utils/date";

const EXECUTE = process.argv.includes("--execute");
const JURISDICTION_SLUG = "menlo-park";
const PAGE_SIZE = 1000;

type DatabaseMeeting = {
  id: string;
  external_id: string;
  title: string;
  date_text: string | null;
  meeting_type: string | null;
  source_url: string | null;
  raw: LlmReadyMeeting | null;
};

type DatabaseDocument = {
  id: string;
  meeting_id: string;
  source_url: string;
};

type DatabaseCard = {
  id: string;
  meeting_id: string;
  agenda_item: string | null;
  source_url: string | null;
  is_published: boolean | null;
  is_featured: boolean | null;
  updated_at: string | null;
};

type DatabaseOutcome = {
  id: string;
  summary_card_id: string;
  meeting_id: string;
  matched_item_key: string;
  match_score: number;
  source_url: string;
  headline: string;
  decided_at: string;
};

type CardPlan = {
  card: DatabaseCard;
  targetExternalId: string;
  outcomes: DatabaseOutcome[];
  translationCount: number;
};

const SPANISH_MEETING_TYPES: Record<string, string> = {
  "City Council": "Concejo Municipal",
  "Complete Streets Commission": "Comisión de Calles Completas",
  "Environmental Quality Commission": "Comisión de Calidad Ambiental",
  "Finance and Audit Commission": "Comisión de Finanzas y Auditoría",
  "Housing Commission": "Comisión de Vivienda",
  "Library Commission": "Comisión de Bibliotecas",
  "Parks and Recreation Commission": "Comisión de Parques y Recreación",
  "Planning Commission": "Comisión de Planificación"
};

const SPANISH_MONTHS: Record<string, string> = {
  january: "enero",
  february: "febrero",
  march: "marzo",
  april: "abril",
  may: "mayo",
  june: "junio",
  july: "julio",
  august: "agosto",
  september: "septiembre",
  october: "octubre",
  november: "noviembre",
  december: "diciembre"
};

function chunks<T>(values: T[], size = 100) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadAllByJurisdiction<T>(
  supabase: SupabaseClient,
  table: string,
  jurisdictionSlug: string,
  select = "*"
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq("jurisdiction_slug", jurisdictionSlug)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
    rows.push(...((data || []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadByIds<T>(
  supabase: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
  select = "*",
  batchSize = 100
) {
  const rows: T[] = [];
  for (const batch of chunks(ids, batchSize)) {
    const { data, error } = await supabase.from(table).select(select).in(column, batch);
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
    rows.push(...((data || []) as T[]));
  }
  return rows;
}

function normalized(value?: string | null) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sameInstant(left?: string | null, right?: string | null) {
  const leftTime = Date.parse(String(left || ""));
  const rightTime = Date.parse(String(right || ""));
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function dateKeyFromText(value?: string | null) {
  const text = String(value || "").trim();
  const numeric = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (numeric) {
    return `${numeric[3]}-${numeric[1].padStart(2, "0")}-${numeric[2].padStart(2, "0")}`;
  }

  const named = text.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})/);
  if (!named) return null;
  const monthName = named[1].toLowerCase();
  const month =
    Object.keys(SPANISH_MONTHS).findIndex((candidate) =>
      candidate.startsWith(monthName.slice(0, 3))
    ) + 1;
  if (month <= 0) return null;
  return `${named[3]}-${String(month).padStart(2, "0")}-${named[2].padStart(2, "0")}`;
}

function dateKeyFromUrl(value?: string | null) {
  const match = String(value || "").match(
    /(?:^|\D)(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])(?:\D|$)/
  );
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function spanishDate(value?: string | null) {
  const match = String(value || "").match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})/);
  if (!match) throw new Error(`Cannot translate Menlo Park date: ${value}`);
  const monthKey = Object.keys(SPANISH_MONTHS).find((candidate) =>
    candidate.startsWith(match[1].toLowerCase().slice(0, 3))
  );
  const month = monthKey ? SPANISH_MONTHS[monthKey] : null;
  if (!month) throw new Error(`Unknown month in Menlo Park date: ${value}`);
  return `${Number(match[2])} de ${month} de ${match[3]}`;
}

function changedMeetingFields(row: DatabaseMeeting, canonical: LlmReadyMeeting) {
  return [
    normalized(row.title) !== normalized(canonical.title) ? "title" : null,
    normalized(row.date_text) !== normalized(canonical.dateText) ? "date_text" : null,
    normalized(row.meeting_type) !== normalized(canonical.meetingType) ? "meeting_type" : null,
    normalized(row.source_url) !== normalized(canonical.sourceUrl) ? "source_url" : null
  ].filter(Boolean);
}

function makeTargetResolver(
  canonicalMeetings: LlmReadyMeeting[],
  databaseMeetings: DatabaseMeeting[]
) {
  const canonicalByExternalId = new Map(
    canonicalMeetings.map((meeting) => [String(meeting.externalId), meeting])
  );
  const ownerTypeByMeetingId = new Map<string, string>();
  const ownerExternalIdByMeetingId = new Map<string, string>();
  for (const row of databaseMeetings) {
    const canonical = canonicalByExternalId.get(row.external_id);
    if (!canonical) {
      throw new Error(`Database meeting is absent from the canonical scrape: ${row.external_id}`);
    }
    ownerTypeByMeetingId.set(row.id, canonical.meetingType);
    ownerExternalIdByMeetingId.set(row.id, row.external_id);
  }

  const exact = new Map<string, LlmReadyMeeting[]>();
  const dated = new Map<string, LlmReadyMeeting[]>();
  for (const meeting of canonicalMeetings) {
    const urls = new Set(
      [meeting.sourceUrl, ...meeting.documents.map((document) => document.url)].filter(Boolean)
    );
    for (const url of urls) {
      const key = `${meeting.meetingType}\n${url}`;
      exact.set(key, [...(exact.get(key) || []), meeting]);
    }

    const dateKey = dateKeyFromText(meeting.dateText);
    if (!dateKey) throw new Error(`Cannot parse canonical meeting date: ${meeting.dateText}`);
    const key = `${meeting.meetingType}\n${dateKey}`;
    dated.set(key, [...(dated.get(key) || []), meeting]);
  }

  return (
    meetingId: string,
    sourceUrl?: string | null,
    allowOwnerFallback = false
  ) => {
    const meetingType = ownerTypeByMeetingId.get(meetingId);
    const ownerExternalId = ownerExternalIdByMeetingId.get(meetingId);
    if (!meetingType || !sourceUrl) return null;

    const exactMatches = exact.get(`${meetingType}\n${sourceUrl}`) || [];
    if (exactMatches.length === 1) return String(exactMatches[0].externalId);
    if (
      exactMatches.length > 1 &&
      ownerExternalId &&
      exactMatches.some((meeting) => String(meeting.externalId) === ownerExternalId)
    ) {
      return ownerExternalId;
    }
    if (exactMatches.length > 1) return allowOwnerFallback ? ownerExternalId || null : null;

    const dateKey = dateKeyFromUrl(sourceUrl);
    if (!dateKey) return allowOwnerFallback ? ownerExternalId || null : null;
    const dateMatches = dated.get(`${meetingType}\n${dateKey}`) || [];
    if (dateMatches.length === 1) return String(dateMatches[0].externalId);
    return allowOwnerFallback ? ownerExternalId || null : null;
  };
}

function selectCardSurvivor(
  group: CardPlan[],
  currentMeetingIdByExternalId: Map<string, string>
) {
  const outcomeCards = group.filter((candidate) => candidate.outcomes.length > 0);
  if (outcomeCards.length > 1) {
    const outcomeKeys = new Set(
      outcomeCards.flatMap((candidate) =>
        candidate.outcomes.map(
          (outcome) =>
            `${outcome.matched_item_key}\n${outcome.source_url}\n${normalized(outcome.headline)}`
        )
      )
    );
    if (outcomeKeys.size !== 1) {
      throw new Error(
        `Duplicate card group has conflicting decision outcomes: ${JSON.stringify(
          group.map((candidate) => ({
            id: candidate.card.id,
            targetExternalId: candidate.targetExternalId,
            agendaItem: candidate.card.agenda_item,
            outcomes: candidate.outcomes.map((outcome) => ({
              id: outcome.id,
              key: outcome.matched_item_key,
              sourceUrl: outcome.source_url
            }))
          }))
        )}`
      );
    }
  }

  const targetMeetingId = currentMeetingIdByExternalId.get(group[0].targetExternalId);
  return [...group].sort((left, right) => {
    const score = (candidate: CardPlan) =>
      (candidate.outcomes.length > 0 ? 1000 : 0) +
      Math.max(0, ...candidate.outcomes.map((outcome) => outcome.match_score || 0)) * 100 +
      candidate.translationCount * 100 +
      (candidate.card.meeting_id === targetMeetingId ? 50 : 0) +
      (candidate.card.is_featured ? 10 : 0) +
      (candidate.card.is_published ? 5 : 0) +
      (Date.parse(candidate.card.updated_at || "") || 0) / 1e13;
    return score(right) - score(left);
  })[0];
}

async function updateMeetingAssignments(
  supabase: SupabaseClient,
  table: "documents" | "summary_cards" | "decision_outcomes",
  assignments: Array<{ id: string; targetMeetingId: string }>
) {
  const byTarget = new Map<string, string[]>();
  for (const assignment of assignments) {
    byTarget.set(assignment.targetMeetingId, [
      ...(byTarget.get(assignment.targetMeetingId) || []),
      assignment.id
    ]);
  }

  for (const [targetMeetingId, ids] of byTarget) {
    for (const batch of chunks(ids)) {
      const { error } = await supabase
        .from(table)
        .update({ meeting_id: targetMeetingId })
        .in("id", batch);
      if (error) throw new Error(`Failed to reassign ${table}: ${error.message}`);
    }
  }
}

async function main() {
  const jurisdiction = getJurisdictionBySlug(JURISDICTION_SLUG);
  if (!jurisdiction) throw new Error("Menlo Park jurisdiction is not configured.");
  const supabase = getServiceSupabaseClientForJurisdiction(JURISDICTION_SLUG);
  const inputPath = path.join(
    process.cwd(),
    "scraped-primegov",
    JURISDICTION_SLUG,
    "pipeline-result.json"
  );
  const pipeline = JSON.parse(await fs.readFile(inputPath, "utf8")) as {
    meetings?: LlmReadyMeeting[];
  };
  const canonicalMeetings = pipeline.meetings || [];
  if (canonicalMeetings.length === 0) throw new Error(`No canonical meetings in ${inputPath}.`);

  const duplicateCanonicalIds = canonicalMeetings
    .map((meeting) => String(meeting.externalId))
    .filter((externalId, index, values) => values.indexOf(externalId) !== index);
  if (duplicateCanonicalIds.length > 0) {
    throw new Error(`Canonical scrape contains duplicate external IDs: ${duplicateCanonicalIds.join(", ")}`);
  }

  const [meetings, documents, cards, outcomes] = await Promise.all([
    loadAllByJurisdiction<DatabaseMeeting>(
      supabase,
      "meetings",
      JURISDICTION_SLUG,
      "id,external_id,title,date_text,meeting_type,source_url,raw"
    ),
    loadAllByJurisdiction<DatabaseDocument>(
      supabase,
      "documents",
      JURISDICTION_SLUG,
      "id,meeting_id,source_url"
    ),
    loadAllByJurisdiction<DatabaseCard>(
      supabase,
      "summary_cards",
      JURISDICTION_SLUG,
      "id,meeting_id,agenda_item,source_url,is_published,is_featured,updated_at"
    ),
    loadAllByJurisdiction<DatabaseOutcome>(
      supabase,
      "decision_outcomes",
      JURISDICTION_SLUG,
      "id,summary_card_id,meeting_id,matched_item_key,match_score,source_url,headline,decided_at"
    )
  ]);
  const meetingIds = meetings.map((meeting) => meeting.id);
  const cardIds = cards.map((card) => card.id);
  const cardTranslations = await loadByIds<Record<string, unknown>>(
    supabase,
    "summary_card_translations",
    "summary_card_id",
    cardIds,
    "id,summary_card_id,locale"
  );

  const canonicalByExternalId = new Map(
    canonicalMeetings.map((meeting) => [String(meeting.externalId), meeting])
  );
  const currentMeetingIdByExternalId = new Map(
    meetings.map((meeting) => [meeting.external_id, meeting.id])
  );
  const affectedMeetings = meetings
    .map((meeting) => ({
      meeting,
      canonical: canonicalByExternalId.get(meeting.external_id)
    }))
    .filter(
      (entry): entry is { meeting: DatabaseMeeting; canonical: LlmReadyMeeting } =>
        Boolean(entry.canonical && changedMeetingFields(entry.meeting, entry.canonical).length > 0)
    );

  const resolveTargetExternalId = makeTargetResolver(canonicalMeetings, meetings);
  const outcomesByCard = new Map<string, DatabaseOutcome[]>();
  for (const outcome of outcomes) {
    outcomesByCard.set(
      outcome.summary_card_id,
      [...(outcomesByCard.get(outcome.summary_card_id) || []), outcome]
    );
  }
  const translationCountsByCard = new Map<string, number>();
  for (const translation of cardTranslations) {
    const cardId = String(translation.summary_card_id || "");
    translationCountsByCard.set(cardId, (translationCountsByCard.get(cardId) || 0) + 1);
  }

  const cardPlans: CardPlan[] = cards.map((card) => {
    const targetExternalId = resolveTargetExternalId(card.meeting_id, card.source_url);
    if (!targetExternalId) {
      throw new Error(`Cannot resolve target meeting for card ${card.id}: ${card.source_url}`);
    }
    return {
      card,
      targetExternalId,
      outcomes: outcomesByCard.get(card.id) || [],
      translationCount: translationCountsByCard.get(card.id) || 0
    };
  });

  const cardGroups: CardPlan[][] = [];
  for (const plan of cardPlans) {
    const matchingGroup = cardGroups.find(
      (group) =>
        group[0].targetExternalId === plan.targetExternalId &&
        group.some(
          (candidate) =>
            normalized(candidate.card.agenda_item) === normalized(plan.card.agenda_item) ||
            areLikelySameAgendaItem(
              candidate.card.agenda_item || "",
              plan.card.agenda_item || ""
            ) ||
            candidate.outcomes.some((leftOutcome) =>
              plan.outcomes.some(
                (rightOutcome) =>
                  leftOutcome.matched_item_key === rightOutcome.matched_item_key
              )
            )
        )
    );
    if (matchingGroup) matchingGroup.push(plan);
    else cardGroups.push([plan]);
  }
  for (let leftIndex = 0; leftIndex < cardGroups.length; leftIndex += 1) {
    const left = cardGroups[leftIndex];
    const leftOutcomeKeys = new Set(
      left.flatMap((plan) => plan.outcomes.map((outcome) => outcome.matched_item_key))
    );
    if (leftOutcomeKeys.size === 0) continue;

    for (let rightIndex = cardGroups.length - 1; rightIndex > leftIndex; rightIndex -= 1) {
      const right = cardGroups[rightIndex];
      if (left[0].targetExternalId !== right[0].targetExternalId) continue;
      const sharesOutcomeKey = right.some((plan) =>
        plan.outcomes.some((outcome) => leftOutcomeKeys.has(outcome.matched_item_key))
      );
      if (!sharesOutcomeKey) continue;
      left.push(...right);
      cardGroups.splice(rightIndex, 1);
    }
  }

  const keptCardPlans: CardPlan[] = [];
  const duplicateCardIds: string[] = [];
  for (const group of cardGroups) {
    const survivor = selectCardSurvivor(group, currentMeetingIdByExternalId);
    keptCardPlans.push(survivor);
    duplicateCardIds.push(
      ...group.filter((candidate) => candidate.card.id !== survivor.card.id).map((candidate) => candidate.card.id)
    );
  }
  const exactCardGroups = new Map<string, number>();
  for (const card of cardPlans) {
    const key = `${card.targetExternalId}\n${normalized(card.card.agenda_item)}`;
    exactCardGroups.set(key, (exactCardGroups.get(key) || 0) + 1);
  }
  const exactDuplicateCardsToDelete = Array.from(exactCardGroups.values()).reduce(
    (total, count) => total + Math.max(0, count - 1),
    0
  );
  const largestDuplicateGroups = cardGroups
    .filter((group) => group.length > 1)
    .sort((left, right) => right.length - left.length)
    .slice(0, 12)
    .map((group) => ({
      targetExternalId: group[0].targetExternalId,
      count: group.length,
      agendaItems: Array.from(
        new Set(group.map((candidate) => candidate.card.agenda_item))
      )
    }));

  const keptCardIds = new Set(keptCardPlans.map((plan) => plan.card.id));
  const outcomeTargetExternalIds = new Map<string, string>();
  const outcomeDecisionDates = new Map<string, string>();
  const outcomeUniqueness = new Map<string, DatabaseOutcome>();
  for (const outcome of outcomes) {
    if (!keptCardIds.has(outcome.summary_card_id)) continue;
    const cardPlan = keptCardPlans.find((plan) => plan.card.id === outcome.summary_card_id);
    if (!cardPlan) throw new Error(`Outcome ${outcome.id} has no kept card plan.`);
    const uniquenessKey = `${cardPlan.targetExternalId}\n${outcome.matched_item_key}`;
    const existingOutcome = outcomeUniqueness.get(uniquenessKey);
    if (existingOutcome) {
      const existingPlan = keptCardPlans.find(
        (plan) => plan.card.id === existingOutcome.summary_card_id
      );
      const currentPlan = keptCardPlans.find(
        (plan) => plan.card.id === outcome.summary_card_id
      );
      throw new Error(
        `Outcome uniqueness collision for ${outcome.matched_item_key}: ${existingOutcome.id} (${existingPlan?.targetExternalId} | ${existingPlan?.card.agenda_item}) and ${outcome.id} (${currentPlan?.targetExternalId} | ${currentPlan?.card.agenda_item}).`
      );
    }
    outcomeUniqueness.set(uniquenessKey, outcome);
    outcomeTargetExternalIds.set(outcome.id, cardPlan.targetExternalId);
    const canonicalMeeting = canonicalByExternalId.get(cardPlan.targetExternalId);
    const decidedAt = canonicalMeeting
      ? parseMeetingDate(
          [canonicalMeeting.dateText, canonicalMeeting.timeText].filter(Boolean).join(" ")
        )
      : null;
    if (!decidedAt) {
      throw new Error(`Cannot resolve canonical decision date for outcome ${outcome.id}.`);
    }
    outcomeDecisionDates.set(outcome.id, decidedAt);
  }

  const documentTargetExternalIds = new Map<string, string>();
  for (const document of documents) {
    const targetExternalId = resolveTargetExternalId(
      document.meeting_id,
      document.source_url,
      true
    );
    if (!targetExternalId) {
      throw new Error(`Cannot resolve target meeting for document ${document.id}: ${document.source_url}`);
    }
    documentTargetExternalIds.set(document.id, targetExternalId);
  }

  const plan = {
    execute: EXECUTE,
    canonicalMeetings: canonicalMeetings.length,
    databaseMeetings: meetings.length,
    meetingsToCreate: canonicalMeetings.filter(
      (meeting) => !currentMeetingIdByExternalId.has(String(meeting.externalId))
    ).map((meeting) => meeting.title),
    meetingsToRestore: affectedMeetings.map(({ meeting, canonical }) => ({
      id: meeting.id,
      externalId: meeting.external_id,
      from: `${meeting.title} | ${meeting.date_text}`,
      to: `${canonical.title} | ${canonical.dateText}`,
      changed: changedMeetingFields(meeting, canonical)
    })),
    documents: documents.length,
    documentMoves: documents.filter(
      (document) =>
        currentMeetingIdByExternalId.get(
          documentTargetExternalIds.get(document.id) || ""
        ) !== document.meeting_id
    ).length,
    cards: cards.length,
    cardMoves: keptCardPlans.filter(
      (card) =>
        currentMeetingIdByExternalId.get(card.targetExternalId) !== card.card.meeting_id
    ).length,
    duplicateCardsToDelete: duplicateCardIds.length,
    exactDuplicateCardsToDelete,
    largestDuplicateGroups,
    outcomes: outcomes.length,
    outcomeDateCorrections: outcomes.filter(
      (outcome) =>
        keptCardIds.has(outcome.summary_card_id) &&
        !sameInstant(outcome.decided_at, outcomeDecisionDates.get(outcome.id))
    ).length,
    meetingTranslationsToReconcile: canonicalMeetings.length
  };

  console.log(JSON.stringify(plan, null, 2));
  if (!EXECUTE) {
    console.log("Dry run only. Pass --execute to apply this validated repair.");
    return;
  }

  const backupPath = path.join(
    "/tmp",
    `simplecity-menlo-park-full-identity-repair-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`
  );
  const [backupMeetings, backupDocuments, backupDuplicateCards, backupMeetingTranslations, backupCardTranslations] =
    await Promise.all([
      loadByIds<Record<string, unknown>>(supabase, "meetings", "id", meetingIds, "*", 5),
      loadByIds<Record<string, unknown>>(
        supabase,
        "documents",
        "id",
        documents.map((document) => document.id),
        "*",
        10
      ),
      loadByIds<Record<string, unknown>>(
        supabase,
        "summary_cards",
        "id",
        duplicateCardIds,
        "*",
        10
      ),
      loadByIds<Record<string, unknown>>(
        supabase,
        "meeting_translations",
        "meeting_id",
        meetingIds,
        "*",
        20
      ),
      loadByIds<Record<string, unknown>>(
        supabase,
        "summary_card_translations",
        "summary_card_id",
        duplicateCardIds,
        "*",
        20
      )
    ]);
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        meetings: backupMeetings,
        documents: backupDocuments,
        cardsBeforeMove: cards,
        deletedCards: backupDuplicateCards,
        outcomes,
        meetingTranslations: backupMeetingTranslations,
        deletedCardTranslations: backupCardTranslations
      },
      null,
      2
    )
  );

  const repairedAt = new Date().toISOString();
  const upsertedMeetings = await upsertMeetings(
    supabase,
    canonicalMeetings,
    repairedAt,
    jurisdiction
  );
  const repairedMeetingIdByExternalId = new Map(
    upsertedMeetings.map((meeting) => [meeting.externalId, meeting.id])
  );

  for (const batch of chunks(duplicateCardIds)) {
    const { error } = await supabase.from("summary_cards").delete().in("id", batch);
    if (error) throw new Error(`Failed to delete duplicate cards: ${error.message}`);
  }

  await updateMeetingAssignments(
    supabase,
    "summary_cards",
    keptCardPlans
      .map((plan) => ({
        id: plan.card.id,
        targetMeetingId: repairedMeetingIdByExternalId.get(plan.targetExternalId) || ""
      }))
      .filter((assignment) => Boolean(assignment.targetMeetingId))
  );

  const outcomeIdsByDecisionDate = new Map<string, string[]>();
  for (const outcome of outcomes) {
    if (!keptCardIds.has(outcome.summary_card_id)) continue;
    const decidedAt = outcomeDecisionDates.get(outcome.id);
    if (!decidedAt) throw new Error(`Missing repaired decision date for outcome ${outcome.id}.`);
    outcomeIdsByDecisionDate.set(decidedAt, [
      ...(outcomeIdsByDecisionDate.get(decidedAt) || []),
      outcome.id
    ]);
  }
  for (const [decidedAt, ids] of outcomeIdsByDecisionDate) {
    for (const batch of chunks(ids)) {
      const { error } = await supabase
        .from("decision_outcomes")
        .update({ decided_at: decidedAt })
        .in("id", batch);
      if (error) throw new Error(`Failed to repair outcome decision dates: ${error.message}`);
    }
  }

  await updateMeetingAssignments(
    supabase,
    "decision_outcomes",
    outcomes
      .filter((outcome) => keptCardIds.has(outcome.summary_card_id))
      .map((outcome) => ({
        id: outcome.id,
        targetMeetingId:
          repairedMeetingIdByExternalId.get(
            outcomeTargetExternalIds.get(outcome.id) || ""
          ) || ""
      }))
      .filter((assignment) => Boolean(assignment.targetMeetingId))
  );

  const repairedMeetings = await loadAllByJurisdiction<DatabaseMeeting>(
    supabase,
    "meetings",
    JURISDICTION_SLUG,
    "id,external_id,title,date_text,meeting_type,source_url,raw"
  );
  const repairedResolver = makeTargetResolver(canonicalMeetings, repairedMeetings);
  const repairedDocuments = await loadAllByJurisdiction<DatabaseDocument>(
    supabase,
    "documents",
    JURISDICTION_SLUG,
    "id,meeting_id,source_url"
  );
  await updateMeetingAssignments(
    supabase,
    "documents",
    repairedDocuments.map((document) => {
      const targetExternalId =
        documentTargetExternalIds.get(document.id) ||
        repairedResolver(document.meeting_id, document.source_url, true);
      const targetMeetingId = targetExternalId
        ? repairedMeetingIdByExternalId.get(targetExternalId)
        : null;
      if (!targetMeetingId) {
        throw new Error(`Cannot resolve repaired document ${document.id}.`);
      }
      return { id: document.id, targetMeetingId };
    })
  );

  const translationRows = canonicalMeetings.map((meeting) => {
    const meetingId = repairedMeetingIdByExternalId.get(String(meeting.externalId));
    const translatedType = SPANISH_MEETING_TYPES[meeting.meetingType];
    if (!meetingId || !translatedType) {
      throw new Error(`Cannot translate canonical meeting ${meeting.externalId}.`);
    }
    return {
      meeting_id: meetingId,
      locale: "es",
      title: `${translatedType} - ${spanishDate(meeting.dateText)}`,
      meeting_type: translatedType,
      source_fingerprint: meetingTranslationFingerprint({
        title: meeting.title,
        meeting_type: meeting.meetingType
      }),
      translation_status: "machine",
      translated_at: repairedAt
    };
  });
  const { error: translationError } = await supabase
    .from("meeting_translations")
    .upsert(translationRows, { onConflict: "meeting_id,locale" });
  if (translationError) {
    throw new Error(`Failed to reconcile meeting translations: ${translationError.message}`);
  }

  const finalCards = await loadAllByJurisdiction<DatabaseCard>(
    supabase,
    "summary_cards",
    JURISDICTION_SLUG,
    "id,meeting_id,agenda_item,source_url,is_published,is_featured,updated_at"
  );
  const finalCardCountByMeetingId = new Map<string, number>();
  for (const card of finalCards) {
    finalCardCountByMeetingId.set(
      card.meeting_id,
      (finalCardCountByMeetingId.get(card.meeting_id) || 0) + 1
    );
  }
  for (const meeting of canonicalMeetings) {
    const meetingId = repairedMeetingIdByExternalId.get(String(meeting.externalId));
    if (!meetingId) throw new Error(`Missing repaired meeting ${meeting.externalId}.`);
    const hasCards = (finalCardCountByMeetingId.get(meetingId) || 0) > 0;
    const { error } = await supabase
      .from("meetings")
      .update(
        hasCards
          ? {
              summarized_source_hash: meetingSourceHash(meeting),
              cards_generated_at: repairedAt
            }
          : { summarized_source_hash: null, cards_generated_at: null }
      )
      .eq("id", meetingId);
    if (error) throw new Error(`Failed to align source hash for ${meeting.title}: ${error.message}`);
  }

  const [verifiedMeetings, verifiedDocuments, verifiedCards, verifiedOutcomes] =
    await Promise.all([
      loadAllByJurisdiction<DatabaseMeeting>(
        supabase,
        "meetings",
        JURISDICTION_SLUG,
        "id,external_id,title,date_text,meeting_type,source_url,raw"
      ),
      loadAllByJurisdiction<DatabaseDocument>(
        supabase,
        "documents",
        JURISDICTION_SLUG,
        "id,meeting_id,source_url"
      ),
      loadAllByJurisdiction<DatabaseCard>(
        supabase,
        "summary_cards",
        JURISDICTION_SLUG,
        "id,meeting_id,agenda_item,source_url,is_published,is_featured,updated_at"
      ),
      loadAllByJurisdiction<DatabaseOutcome>(
        supabase,
        "decision_outcomes",
        JURISDICTION_SLUG,
        "id,summary_card_id,meeting_id,matched_item_key,match_score,source_url,headline,decided_at"
      )
    ]);
  const verifiedMeetingById = new Map(verifiedMeetings.map((meeting) => [meeting.id, meeting]));
  const verifiedMeetingIdByExternalId = new Map(
    verifiedMeetings.map((meeting) => [meeting.external_id, meeting.id])
  );
  const meetingMismatches = verifiedMeetings.filter((meeting) => {
    const canonical = canonicalByExternalId.get(meeting.external_id);
    return !canonical || changedMeetingFields(meeting, canonical).length > 0;
  });
  const verifiedResolver = makeTargetResolver(canonicalMeetings, verifiedMeetings);
  const misplacedDocuments = verifiedDocuments.filter((document) => {
    const targetExternalId = verifiedResolver(
      document.meeting_id,
      document.source_url,
      true
    );
    return (
      !targetExternalId ||
      verifiedMeetingIdByExternalId.get(targetExternalId) !== document.meeting_id
    );
  });
  const misplacedCards = verifiedCards.filter((card) => {
    const targetExternalId = verifiedResolver(card.meeting_id, card.source_url);
    return (
      !targetExternalId ||
      verifiedMeetingIdByExternalId.get(targetExternalId) !== card.meeting_id
    );
  });
  const duplicateVerifiedCards: string[] = [];
  const verifiedCardsByMeeting = new Map<string, DatabaseCard[]>();
  for (const card of verifiedCards) {
    const existingCards = verifiedCardsByMeeting.get(card.meeting_id) || [];
    if (
      existingCards.some(
        (candidate) =>
          normalized(candidate.agenda_item) === normalized(card.agenda_item) ||
          areLikelySameAgendaItem(candidate.agenda_item || "", card.agenda_item || "")
      )
    ) {
      duplicateVerifiedCards.push(card.id);
    }
    verifiedCardsByMeeting.set(card.meeting_id, [...existingCards, card]);
  }
  const verifiedCardById = new Map(verifiedCards.map((card) => [card.id, card]));
  const misplacedOutcomes = verifiedOutcomes.filter(
    (outcome) =>
      verifiedCardById.get(outcome.summary_card_id)?.meeting_id !== outcome.meeting_id
  );
  const incorrectOutcomeDates = verifiedOutcomes.filter(
    (outcome) => !sameInstant(outcome.decided_at, outcomeDecisionDates.get(outcome.id))
  );
  const missingCanonicalMeetings = canonicalMeetings.filter(
    (meeting) => !verifiedMeetingIdByExternalId.has(String(meeting.externalId))
  );

  if (
    verifiedMeetings.length !== canonicalMeetings.length ||
    meetingMismatches.length > 0 ||
    missingCanonicalMeetings.length > 0 ||
    misplacedDocuments.length > 0 ||
    misplacedCards.length > 0 ||
    misplacedOutcomes.length > 0 ||
    incorrectOutcomeDates.length > 0 ||
    duplicateVerifiedCards.length > 0
  ) {
    throw new Error(
      `Post-repair verification failed: ${JSON.stringify({
        verifiedMeetings: verifiedMeetings.length,
        canonicalMeetings: canonicalMeetings.length,
        meetingMismatches: meetingMismatches.length,
        missingCanonicalMeetings: missingCanonicalMeetings.length,
        misplacedDocuments: misplacedDocuments.length,
        misplacedCards: misplacedCards.length,
        misplacedOutcomes: misplacedOutcomes.length,
        incorrectOutcomeDates: incorrectOutcomeDates.length,
        duplicateVerifiedCards: duplicateVerifiedCards.length
      })}`
    );
  }

  await writeAuditLog(supabase, {
    adminEmail: "codex-repair@simplecity.local",
    action: "repair_all_menlo_park_meeting_identity_collisions",
    entityType: "meeting",
    jurisdictionSlug: JURISDICTION_SLUG,
    before: { backupPath, plan },
    after: {
      meetings: verifiedMeetings.length,
      documents: verifiedDocuments.length,
      cards: verifiedCards.length,
      outcomes: verifiedOutcomes.length,
      outcomeDatesCorrected: plan.outcomeDateCorrections,
      deletedDuplicateCardIds: duplicateCardIds
    }
  });

  console.log(
    JSON.stringify(
      {
        status: "repaired",
        backupPath,
        meetings: verifiedMeetings.length,
        documents: verifiedDocuments.length,
        cards: verifiedCards.length,
        outcomes: verifiedOutcomes.length,
        meetingIdsVerified: verifiedMeetingById.size,
        outcomeDatesCorrected: plan.outcomeDateCorrections,
        duplicateCardsDeleted: duplicateCardIds.length
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
