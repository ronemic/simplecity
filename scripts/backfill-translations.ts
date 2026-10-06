import "@/lib/env/bootstrap";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALL_JURISDICTIONS_SLUG,
  getAllServiceSupabaseClients,
  getJurisdictionBySlug,
  getServiceSupabaseClientForJurisdiction,
  requireValidJurisdictionSlug,
  type JurisdictionConfig,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import {
  getDecisionOutcomesNeedingTranslation,
  translateAndUpsertDecisionOutcomes
} from "@/lib/db/upsertDecisionOutcomeTranslations";
import {
  meetingTranslationFingerprint,
  summaryCardTranslationFingerprint
} from "@/lib/db/translationFingerprint";
import { untranslatedEnglishCardFields } from "@/lib/i18n/untranslatedEnglish";
import { generateTranslations } from "@/lib/llm/translate";
import type {
  DecisionOutcome,
  MeetingRow,
  MeetingTranslationRow,
  SummaryCardRow,
  SummaryCardTranslationRow
} from "@/lib/types";
import {
  officialSourceFallbackExplanation,
  officialSourceFallbackReason,
  type OfficialSourceFallbackReason
} from "@/lib/utils/summaryFallback";
import { normalizeSummaryPoints, summaryPointsStorageText } from "@/lib/utils/summaryPoints";

type BackfillOptions = {
  jurisdiction: JurisdictionSelection;
  locale: "es";
  limit: number;
  batchSize: number;
  dryRun: boolean;
  meetingsOnly: boolean;
  cardsOnly: boolean;
  outcomesOnly: boolean;
};

/**
 * Why a row is being (re)translated. Candidates are processed in this order, so
 * a backlog of missing translations is never starved by rows that only need a
 * retry.
 */
type CandidateReason = "missing" | "stale" | "english";
const REASON_PRIORITY: Record<CandidateReason, number> = { missing: 0, stale: 1, english: 2 };

type MeetingCandidate = Pick<MeetingRow, "id" | "title" | "meeting_type" | "jurisdiction_slug"> & {
  source_fingerprint: string;
  reason: CandidateReason;
};

type CardCandidate = Pick<
  SummaryCardRow,
  | "id"
  | "meeting_id"
  | "jurisdiction_slug"
  | "agenda_item"
  | "why_it_matters"
  | "who_it_affects"
  | "status"
  | "comment_window_opens"
  | "comment_window_closes"
  | "how_to_act_attend"
  | "how_to_act_email"
  | "how_to_act_submit_comment"
> & {
  what_is_happening: string[];
  source_fingerprint: string;
  reason: CandidateReason;
  fallbackReason: OfficialSourceFallbackReason | null;
};

type OutcomeCandidate = DecisionOutcome & { id: string; summary_card_id: string };

type StepResult = { candidates: number; written: number; failed: number };

const PAGE_SIZE = 1000;
const LOOKUP_CHUNK_SIZE = 100;

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function getPositiveIntArg(name: string, fallback: number) {
  const raw = getArgValue(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer.`);
  return value;
}

function getOptions(): BackfillOptions {
  const requested = getArgValue("jurisdiction") || "foster-city";
  const jurisdiction = requireValidJurisdictionSlug(requested);
  const locale = getArgValue("locale") || "es";
  if (locale !== "es") throw new Error("Only --locale=es is supported right now.");

  return {
    jurisdiction,
    locale,
    limit: getPositiveIntArg("limit", 25),
    batchSize: getPositiveIntArg("batch-size", 10),
    dryRun: hasFlag("dry-run"),
    meetingsOnly: hasFlag("meetings-only"),
    cardsOnly: hasFlag("cards-only"),
    outcomesOnly: hasFlag("outcomes-only")
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function jurisdictionFilter(jurisdiction: JurisdictionConfig) {
  return jurisdiction.slug === "foster-city"
    ? "jurisdiction_slug.eq.foster-city,jurisdiction_slug.is.null"
    : `jurisdiction_slug.eq.${jurisdiction.slug}`;
}

// PostgREST caps an unranged select at 1,000 rows, so whole-table scans page.
async function selectAll<T>(
  load: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  context: string
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await load(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${context}: ${error.message}`);
    const page = (Array.isArray(data) ? data : []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function selectByIds<T>(
  ids: string[],
  load: (ids: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  context: string
) {
  const rows: T[] = [];
  for (const batch of chunk(ids, LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await load(batch);
    if (error) throw new Error(`${context}: ${error.message}`);
    rows.push(...((Array.isArray(data) ? data : []) as T[]));
  }
  return rows;
}

function byPriority<T extends { reason: CandidateReason }>(rows: T[]) {
  // Array.prototype.sort is stable, so newest-first order holds within a reason.
  return [...rows].sort((left, right) => REASON_PRIORITY[left.reason] - REASON_PRIORITY[right.reason]);
}

function sameText(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left?.trim()) && left?.trim() === right?.trim();
}

async function getMeetingCandidates(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  locale: string,
  limit: number
): Promise<MeetingCandidate[]> {
  const rows = await selectAll<MeetingRow>(
    (from, to) =>
      supabase
        .from("meetings")
        .select("id,title,meeting_type,jurisdiction_slug,updated_at")
        .or(jurisdictionFilter(jurisdiction))
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    "Failed to read meetings"
  );
  const existing = new Map(
    (
      await selectByIds<MeetingTranslationRow>(
        rows.map((row) => row.id),
        (ids) =>
          supabase
            .from("meeting_translations")
            .select("meeting_id,title,source_fingerprint")
            .eq("locale", locale)
            .in("meeting_id", ids),
        "Failed to read meeting translations"
      )
    ).map((row) => [row.meeting_id, row])
  );

  const candidates = rows.flatMap((row): MeetingCandidate[] => {
    const sourceFingerprint = meetingTranslationFingerprint(row);
    const translation = existing.get(row.id);
    const reason: CandidateReason | null = !translation
      ? "missing"
      : translation.source_fingerprint !== sourceFingerprint
        ? "stale"
        : sameText(translation.title, row.title)
          ? "english"
          : null;
    if (!reason) return [];
    return [
      {
        id: row.id,
        title: row.title,
        meeting_type: row.meeting_type,
        jurisdiction_slug: row.jurisdiction_slug,
        source_fingerprint: sourceFingerprint,
        reason
      }
    ];
  });

  return byPriority(candidates).slice(0, limit);
}

async function getPublishedCards(supabase: SupabaseClient, jurisdiction: JurisdictionConfig) {
  return selectAll<SummaryCardRow>(
    (from, to) =>
      supabase
        .from("summary_cards")
        .select(
          [
            "id",
            "meeting_id",
            "jurisdiction_slug",
            "agenda_item",
            "what_is_happening",
            "why_it_matters",
            "who_it_affects",
            "status",
            "comment_window_opens",
            "comment_window_closes",
            "how_to_act_attend",
            "how_to_act_email",
            "how_to_act_submit_comment",
            "updated_at"
          ].join(",")
        )
        .or(jurisdictionFilter(jurisdiction))
        .eq("is_published", true)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    "Failed to read summary cards"
  );
}

/**
 * A current translation still needs work when it reads as English. Fallback
 * cards are written with the official (English) agenda text as their Spanish
 * title, so an unchanged title counts too.
 */
function cardTranslationNeedsRetranslation(card: SummaryCardRow, translation: SummaryCardTranslationRow) {
  if (officialSourceFallbackReason(card.why_it_matters) && sameText(translation.agenda_item, card.agenda_item)) {
    return true;
  }
  return (
    untranslatedEnglishCardFields({
      agenda_item: translation.agenda_item,
      what_is_happening: normalizeSummaryPoints(translation.what_is_happening),
      why_it_matters: translation.why_it_matters,
      who_it_affects: translation.who_it_affects,
      comment_window_opens: translation.comment_window_opens,
      comment_window_closes: translation.comment_window_closes,
      how_to_act_attend: translation.how_to_act_attend,
      how_to_act_email: translation.how_to_act_email,
      how_to_act_submit_comment: translation.how_to_act_submit_comment
    }).length > 0
  );
}

async function getCardCandidates(
  supabase: SupabaseClient,
  cards: SummaryCardRow[],
  locale: string,
  limit: number
): Promise<CardCandidate[]> {
  const existing = new Map(
    (
      await selectByIds<SummaryCardTranslationRow>(
        cards.map((row) => row.id),
        (ids) =>
          supabase
            .from("summary_card_translations")
            .select(
              [
                "summary_card_id",
                "source_fingerprint",
                "agenda_item",
                "what_is_happening",
                "why_it_matters",
                "who_it_affects",
                "comment_window_opens",
                "comment_window_closes",
                "how_to_act_attend",
                "how_to_act_email",
                "how_to_act_submit_comment"
              ].join(",")
            )
            .eq("locale", locale)
            .in("summary_card_id", ids),
        "Failed to read card translations"
      )
    ).map((row) => [row.summary_card_id, row])
  );

  const candidates = cards.flatMap((row): CardCandidate[] => {
    const sourceFingerprint = summaryCardTranslationFingerprint(row);
    const translation = existing.get(row.id);
    const reason: CandidateReason | null = !translation
      ? "missing"
      : translation.source_fingerprint !== sourceFingerprint
        ? "stale"
        : cardTranslationNeedsRetranslation(row, translation)
          ? "english"
          : null;
    if (!reason) return [];
    return [
      {
        id: row.id,
        meeting_id: row.meeting_id,
        jurisdiction_slug: row.jurisdiction_slug,
        agenda_item: row.agenda_item,
        what_is_happening: normalizeSummaryPoints(row.what_is_happening),
        why_it_matters: row.why_it_matters,
        who_it_affects: row.who_it_affects,
        status: row.status,
        comment_window_opens: row.comment_window_opens,
        comment_window_closes: row.comment_window_closes,
        how_to_act_attend: row.how_to_act_attend,
        how_to_act_email: row.how_to_act_email,
        how_to_act_submit_comment: row.how_to_act_submit_comment,
        source_fingerprint: sourceFingerprint,
        reason,
        fallbackReason: officialSourceFallbackReason(row.why_it_matters)
      }
    ];
  });

  return byPriority(candidates).slice(0, limit);
}

async function getOutcomeCandidates(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  publishedCardIds: Set<string>,
  locale: "es",
  limit: number
): Promise<OutcomeCandidate[]> {
  const outcomes = (
    await selectAll<OutcomeCandidate>(
      (from, to) =>
        supabase
          .from("decision_outcomes")
          .select("id,summary_card_id,headline,summary,vote,next_step,jurisdiction_slug,updated_at")
          .or(jurisdictionFilter(jurisdiction))
          .order("updated_at", { ascending: false })
          .order("id")
          .range(from, to),
      "Failed to read decision outcomes"
    )
  ).filter((outcome) => publishedCardIds.has(outcome.summary_card_id));

  const candidates: OutcomeCandidate[] = [];
  for (const batch of chunk(outcomes, LOOKUP_CHUNK_SIZE)) {
    candidates.push(...(await getDecisionOutcomesNeedingTranslation(supabase, batch, locale)));
    if (candidates.length >= limit) break;
  }
  return candidates.slice(0, limit);
}

/**
 * Translates in batches. A rejected batch is retried one item at a time so a
 * single untranslatable row cannot hold back the rest of the backlog.
 */
async function translateInBatches<T extends { id: string }>(
  label: string,
  candidates: T[],
  batchSize: number,
  translate: (group: T[]) => Promise<number>
): Promise<{ written: number; failed: number }> {
  let written = 0;
  let failed = 0;

  for (const group of chunk(candidates, batchSize)) {
    try {
      written += await translate(group);
      continue;
    } catch (error) {
      if (group.length === 1) {
        failed += 1;
        console.log(`Skipped ${label} ${group[0].id}: ${errorMessage(error).slice(0, 300)}`);
        continue;
      }
      console.log(`${label} batch failed (${errorMessage(error).slice(0, 200)}); retrying one at a time.`);
    }

    for (const item of group) {
      try {
        written += await translate([item]);
      } catch (error) {
        failed += 1;
        console.log(`Skipped ${label} ${item.id}: ${errorMessage(error).slice(0, 300)}`);
      }
    }
  }

  return { written, failed };
}

async function writeMeetingTranslations(
  supabase: SupabaseClient,
  locale: string,
  candidates: MeetingCandidate[],
  translated: NonNullable<Awaited<ReturnType<typeof generateTranslations>>["translations"]["meetings"]>,
  raw: unknown
) {
  const candidateById = new Map(candidates.map((row) => [row.id, row]));
  const rows = translated.map((row) => {
    const candidate = candidateById.get(row.id);
    if (!candidate) throw new Error(`Unexpected meeting translation id ${row.id}.`);

    return {
      meeting_id: row.id,
      locale,
      title: row.title,
      meeting_type: row.meeting_type,
      source_fingerprint: candidate.source_fingerprint,
      translation_status: "machine",
      raw_llm_json: raw,
      translated_at: new Date().toISOString()
    };
  });

  const { error } = await supabase
    .from("meeting_translations")
    .upsert(rows, { onConflict: "meeting_id,locale" });

  if (error) throw new Error(`Failed to write meeting translations: ${error.message}`);
  return rows.length;
}

async function writeCardTranslations(
  supabase: SupabaseClient,
  locale: string,
  candidates: CardCandidate[],
  translated: NonNullable<Awaited<ReturnType<typeof generateTranslations>>["translations"]["cards"]>,
  raw: unknown
) {
  const candidateById = new Map(candidates.map((row) => [row.id, row]));
  const rows = translated.map((row) => {
    const candidate = candidateById.get(row.id);
    if (!candidate) throw new Error(`Unexpected card translation id ${row.id}.`);

    return {
      summary_card_id: row.id,
      locale,
      agenda_item: row.agenda_item,
      what_is_happening: summaryPointsStorageText(row.what_is_happening),
      // Fallback cards are recognized by their exact explanation text
      // (officialSourceFallbackReason), so it is never machine-translated.
      why_it_matters: candidate.fallbackReason
        ? officialSourceFallbackExplanation(candidate.fallbackReason, "es")
        : row.why_it_matters,
      who_it_affects: row.who_it_affects || [],
      // Status stays the source English enum; statusLabel translates it.
      status: candidate.status,
      comment_window_opens: row.comment_window_opens,
      comment_window_closes: row.comment_window_closes,
      how_to_act_attend: row.how_to_act_attend,
      how_to_act_email: row.how_to_act_email,
      how_to_act_submit_comment: row.how_to_act_submit_comment,
      source_fingerprint: candidate.source_fingerprint,
      translation_status: "machine",
      raw_llm_json: raw,
      translated_at: new Date().toISOString()
    };
  });

  const { error } = await supabase
    .from("summary_card_translations")
    .upsert(rows, { onConflict: "summary_card_id,locale" });

  if (error) throw new Error(`Failed to write card translations: ${error.message}`);
  return rows.length;
}

async function translateMeetings(
  supabase: SupabaseClient,
  options: BackfillOptions,
  jurisdiction: JurisdictionConfig
): Promise<StepResult> {
  const candidates = await getMeetingCandidates(supabase, jurisdiction, options.locale, options.limit);
  console.log(`Meeting translations needed: ${candidates.length}`);
  if (options.dryRun || candidates.length === 0) {
    return { candidates: candidates.length, written: 0, failed: 0 };
  }

  const result = await translateInBatches("meeting", candidates, options.batchSize, async (group) => {
    const { translations, raw } = await generateTranslations(
      {
        locale: options.locale,
        meetings: group.map((row) => ({
          id: row.id,
          title: row.title,
          meeting_type: row.meeting_type
        }))
      },
      { log: console.log }
    );
    return writeMeetingTranslations(supabase, options.locale, group, translations.meetings || [], raw);
  });
  console.log(`Wrote ${result.written} meeting translations (${result.failed} skipped).`);
  return { candidates: candidates.length, ...result };
}

async function translateCards(
  supabase: SupabaseClient,
  options: BackfillOptions,
  cards: SummaryCardRow[]
): Promise<StepResult> {
  const candidates = await getCardCandidates(supabase, cards, options.locale, options.limit);
  console.log(`Card translations needed: ${candidates.length}`);
  if (options.dryRun || candidates.length === 0) {
    return { candidates: candidates.length, written: 0, failed: 0 };
  }

  const result = await translateInBatches("card", candidates, options.batchSize, async (group) => {
    const { translations, raw } = await generateTranslations(
      {
        locale: options.locale,
        cards: group.map((row) => ({
          id: row.id,
          agenda_item: row.agenda_item,
          what_is_happening: row.what_is_happening,
          why_it_matters: row.fallbackReason ? null : row.why_it_matters,
          who_it_affects: row.who_it_affects,
          status: row.status,
          comment_window_opens: row.comment_window_opens,
          comment_window_closes: row.comment_window_closes,
          how_to_act_attend: row.how_to_act_attend,
          how_to_act_email: row.how_to_act_email,
          how_to_act_submit_comment: row.how_to_act_submit_comment
        }))
      },
      { log: console.log }
    );
    return writeCardTranslations(supabase, options.locale, group, translations.cards || [], raw);
  });
  console.log(`Wrote ${result.written} card translations (${result.failed} skipped).`);
  return { candidates: candidates.length, ...result };
}

async function translateOutcomes(
  supabase: SupabaseClient,
  options: BackfillOptions,
  jurisdiction: JurisdictionConfig,
  publishedCardIds: Set<string>
): Promise<StepResult> {
  const candidates = await getOutcomeCandidates(
    supabase,
    jurisdiction,
    publishedCardIds,
    options.locale,
    options.limit
  );
  console.log(`Decision outcome translations needed: ${candidates.length}`);
  if (options.dryRun || candidates.length === 0) {
    return { candidates: candidates.length, written: 0, failed: 0 };
  }

  const result = await translateInBatches("decision outcome", candidates, options.batchSize, (group) =>
    translateAndUpsertDecisionOutcomes(supabase, group, options.locale, { log: console.log })
  );
  console.log(`Wrote ${result.written} decision outcome translations (${result.failed} skipped).`);
  return { candidates: candidates.length, ...result };
}

async function backfillJurisdiction(
  supabase: SupabaseClient,
  options: BackfillOptions,
  jurisdiction: JurisdictionConfig
) {
  console.log(
    `Backfilling ${options.locale} translations for ${jurisdiction.name} with limit=${options.limit}, batchSize=${options.batchSize}${options.dryRun ? " (dry run)" : ""}.`
  );

  const results: StepResult[] = [];
  const hasExclusiveTarget = options.meetingsOnly || options.cardsOnly || options.outcomesOnly;

  if (!hasExclusiveTarget || options.meetingsOnly) {
    results.push(await translateMeetings(supabase, options, jurisdiction));
  }

  if (!hasExclusiveTarget || options.cardsOnly || options.outcomesOnly) {
    const cards = await getPublishedCards(supabase, jurisdiction);
    if (!hasExclusiveTarget || options.cardsOnly) {
      results.push(await translateCards(supabase, options, cards));
    }
    if (!hasExclusiveTarget || options.outcomesOnly) {
      results.push(
        await translateOutcomes(supabase, options, jurisdiction, new Set(cards.map((card) => card.id)))
      );
    }
  }

  return results;
}

async function main() {
  const options = getOptions();
  const targets =
    options.jurisdiction === ALL_JURISDICTIONS_SLUG
      ? getAllServiceSupabaseClients()
      : [
          {
            jurisdiction: getJurisdictionBySlug(options.jurisdiction)!,
            supabase: getServiceSupabaseClientForJurisdiction(options.jurisdiction)
          }
        ];

  const totals: StepResult = { candidates: 0, written: 0, failed: 0 };
  const failedJurisdictions: string[] = [];
  for (const { jurisdiction, supabase } of targets) {
    try {
      for (const result of await backfillJurisdiction(supabase, options, jurisdiction)) {
        totals.candidates += result.candidates;
        totals.written += result.written;
        totals.failed += result.failed;
      }
    } catch (error) {
      failedJurisdictions.push(jurisdiction.slug);
      console.error(`Backfill failed for ${jurisdiction.slug}: ${errorMessage(error)}`);
    }
  }

  console.log(
    `Done. Candidates: ${totals.candidates}, written: ${totals.written}, skipped: ${totals.failed}${failedJurisdictions.length ? `, failed jurisdictions: ${failedJurisdictions.join(", ")}` : ""}.`
  );

  // Individual skips are expected (a row the model keeps leaving in English is
  // retried next run), so only fail when a jurisdiction could not be read or
  // nothing at all could be written.
  if (failedJurisdictions.length > 0 || (totals.failed > 0 && totals.written === 0)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
