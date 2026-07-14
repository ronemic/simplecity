import "@/lib/env/bootstrap";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDefaultJurisdiction,
  getJurisdictionBySlug,
  getServiceSupabaseClientForJurisdiction,
  requireValidJurisdictionSlug,
  type JurisdictionConfig,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";
import {
  meetingTranslationFingerprint,
  summaryCardTranslationFingerprint
} from "@/lib/db/translationFingerprint";
import { generateTranslations } from "@/lib/llm/translate";
import type {
  MeetingRow,
  MeetingTranslationRow,
  SummaryCardRow,
  SummaryCardTranslationRow
} from "@/lib/types";
import { normalizeSummaryPoints, summaryPointsStorageText } from "@/lib/utils/summaryPoints";

type BackfillOptions = {
  jurisdiction: JurisdictionSlug;
  locale: "es";
  limit: number;
  batchSize: number;
  dryRun: boolean;
  meetingsOnly: boolean;
  cardsOnly: boolean;
};

type MeetingCandidate = Pick<MeetingRow, "id" | "title" | "meeting_type" | "jurisdiction_slug"> & {
  source_fingerprint: string;
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
};

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
  if (jurisdiction === "all") throw new Error("Use a concrete jurisdiction for translation backfills.");
  const locale = getArgValue("locale") || "es";
  if (locale !== "es") throw new Error("Only --locale=es is supported right now.");

  return {
    jurisdiction,
    locale,
    limit: getPositiveIntArg("limit", 25),
    batchSize: getPositiveIntArg("batch-size", 10),
    dryRun: hasFlag("dry-run"),
    meetingsOnly: hasFlag("meetings-only"),
    cardsOnly: hasFlag("cards-only")
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function jurisdictionFilter(jurisdiction: JurisdictionConfig) {
  return jurisdiction.slug === "foster-city"
    ? "jurisdiction_slug.eq.foster-city,jurisdiction_slug.is.null"
    : `jurisdiction_slug.eq.${jurisdiction.slug}`;
}

async function fetchExistingMeetingTranslations(
  supabase: SupabaseClient,
  locale: string,
  meetingIds: string[]
) {
  if (meetingIds.length === 0) return new Map<string, MeetingTranslationRow>();
  const { data, error } = await supabase
    .from("meeting_translations")
    .select("*")
    .eq("locale", locale)
    .in("meeting_id", meetingIds);

  if (error) throw new Error(`Failed to read meeting translations. Has the migration been applied? ${error.message}`);
  return new Map(((data || []) as MeetingTranslationRow[]).map((row) => [row.meeting_id, row]));
}

async function fetchExistingCardTranslations(
  supabase: SupabaseClient,
  locale: string,
  cardIds: string[]
) {
  if (cardIds.length === 0) return new Map<string, SummaryCardTranslationRow>();
  const { data, error } = await supabase
    .from("summary_card_translations")
    .select("*")
    .eq("locale", locale)
    .in("summary_card_id", cardIds);

  if (error) throw new Error(`Failed to read card translations. Has the migration been applied? ${error.message}`);
  return new Map(((data || []) as SummaryCardTranslationRow[]).map((row) => [row.summary_card_id, row]));
}

async function getMeetingCandidates(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  locale: string,
  limit: number
): Promise<MeetingCandidate[]> {
  const { data, error } = await supabase
    .from("meetings")
    .select("id,title,meeting_type,jurisdiction_slug,updated_at")
    .or(jurisdictionFilter(jurisdiction))
    .order("updated_at", { ascending: false })
    .limit(Math.max(limit * 3, limit));

  if (error) throw new Error(`Failed to read meetings: ${error.message}`);

  const rows = (data || []) as MeetingRow[];
  const existing = await fetchExistingMeetingTranslations(
    supabase,
    locale,
    rows.map((row) => row.id)
  );

  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      meeting_type: row.meeting_type,
      jurisdiction_slug: row.jurisdiction_slug,
      source_fingerprint: meetingTranslationFingerprint(row)
    }))
    .filter((row) => existing.get(row.id)?.source_fingerprint !== row.source_fingerprint)
    .slice(0, limit);
}

async function getCardCandidates(
  supabase: SupabaseClient,
  jurisdiction: JurisdictionConfig,
  locale: string,
  limit: number
): Promise<CardCandidate[]> {
  const { data, error } = await supabase
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
    .limit(Math.max(limit * 3, limit));

  if (error) throw new Error(`Failed to read summary cards: ${error.message}`);

  const rows = (data || []) as unknown as SummaryCardRow[];
  const existing = await fetchExistingCardTranslations(
    supabase,
    locale,
    rows.map((row) => row.id)
  );

  return rows
    .map((row) => ({
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
      source_fingerprint: summaryCardTranslationFingerprint(row)
    }))
    .filter((row) => existing.get(row.id)?.source_fingerprint !== row.source_fingerprint)
    .slice(0, limit);
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
      why_it_matters: row.why_it_matters,
      who_it_affects: row.who_it_affects || [],
      status: row.status,
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
}

async function translateMeetings(
  supabase: SupabaseClient,
  options: BackfillOptions,
  jurisdiction: JurisdictionConfig
) {
  const candidates = await getMeetingCandidates(supabase, jurisdiction, options.locale, options.limit);
  console.log(`Meeting translations needed: ${candidates.length}`);
  if (options.dryRun || candidates.length === 0) return candidates.length;

  for (const group of chunk(candidates, options.batchSize)) {
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

    await writeMeetingTranslations(supabase, options.locale, group, translations.meetings || [], raw);
    console.log(`Wrote ${translations.meetings?.length || 0} meeting translations.`);
  }

  return candidates.length;
}

async function translateCards(
  supabase: SupabaseClient,
  options: BackfillOptions,
  jurisdiction: JurisdictionConfig
) {
  const candidates = await getCardCandidates(supabase, jurisdiction, options.locale, options.limit);
  console.log(`Card translations needed: ${candidates.length}`);
  if (options.dryRun || candidates.length === 0) return candidates.length;

  for (const group of chunk(candidates, options.batchSize)) {
    const { translations, raw } = await generateTranslations(
      {
        locale: options.locale,
        cards: group.map((row) => ({
          id: row.id,
          agenda_item: row.agenda_item,
          what_is_happening: row.what_is_happening,
          why_it_matters: row.why_it_matters,
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

    await writeCardTranslations(supabase, options.locale, group, translations.cards || [], raw);
    console.log(`Wrote ${translations.cards?.length || 0} card translations.`);
  }

  return candidates.length;
}

async function main() {
  const options = getOptions();
  const jurisdiction = getJurisdictionBySlug(options.jurisdiction) || getDefaultJurisdiction();
  const supabase = getServiceSupabaseClientForJurisdiction(options.jurisdiction);

  console.log(
    `Backfilling ${options.locale} translations for ${jurisdiction.name} with limit=${options.limit}, batchSize=${options.batchSize}${options.dryRun ? " (dry run)" : ""}.`
  );

  let meetings = 0;
  let cards = 0;

  if (!options.cardsOnly) {
    meetings = await translateMeetings(supabase, options, jurisdiction);
  }

  if (!options.meetingsOnly) {
    cards = await translateCards(supabase, options, jurisdiction);
  }

  console.log(`Done. Processed candidates: ${meetings} meetings, ${cards} cards.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
