import type { SupabaseClient } from "@supabase/supabase-js";
import { decisionOutcomeTranslationFingerprint } from "@/lib/db/translationFingerprint";
import {
  decisionOutcomeTranslationIssues,
  readEmbeddedDecisionOutcomeTranslation,
  withEmbeddedDecisionOutcomeTranslation,
  type PublicDecisionOutcomeTranslation
} from "@/lib/i18n/decisionOutcome";
import { generateTranslations, type TranslationLocale } from "@/lib/llm/translate";
import type { DecisionOutcome } from "@/lib/types";

type TranslatableDecisionOutcome = DecisionOutcome & {
  id: string;
  summary_card_id: string;
};

function isMissingTranslationTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "PGRST205" ||
        /decision_outcome_translations|could not find the table/i.test(error.message || ""))
  );
}

async function loadEmbeddedTranslations(
  supabase: SupabaseClient,
  outcomes: TranslatableDecisionOutcome[],
  locale: TranslationLocale
) {
  const { data, error } = await supabase
    .from("summary_card_translations")
    .select("summary_card_id,source_fingerprint,raw_llm_json")
    .eq("locale", locale)
    .in(
      "summary_card_id",
      outcomes.map((outcome) => outcome.summary_card_id)
    );
  if (error) {
    throw new Error(`Failed to inspect embedded outcome translations: ${error.message}`);
  }
  return new Map((data || []).map((row) => [row.summary_card_id, row]));
}

export async function getDecisionOutcomesNeedingTranslation(
  supabase: SupabaseClient,
  outcomes: TranslatableDecisionOutcome[],
  locale: TranslationLocale
) {
  if (outcomes.length === 0) return [];

  const { data: existing, error: existingError } = await supabase
    .from("decision_outcome_translations")
    .select("decision_outcome_id,headline,summary,vote,next_step,source_fingerprint")
    .eq("locale", locale)
    .in(
      "decision_outcome_id",
      outcomes.map((outcome) => outcome.id)
    );
  if (existingError && !isMissingTranslationTable(existingError)) {
    throw new Error(`Failed to inspect decision outcome translations: ${existingError.message}`);
  }
  if (isMissingTranslationTable(existingError)) {
    const embedded = await loadEmbeddedTranslations(supabase, outcomes, locale);
    return outcomes.filter((outcome) => {
      const translation = readEmbeddedDecisionOutcomeTranslation(
        embedded.get(outcome.summary_card_id)?.raw_llm_json
      );
      return (
        !translation ||
        translation.source_fingerprint !== decisionOutcomeTranslationFingerprint(outcome) ||
        decisionOutcomeTranslationIssues(outcome, translation).length > 0
      );
    });
  }
  const existingTranslations = new Map(
    (existing || []).map((row) => [row.decision_outcome_id, row])
  );
  const candidates = outcomes.filter(
    (outcome) => {
      const translation = existingTranslations.get(outcome.id);
      return (
        !translation ||
        translation.source_fingerprint !== decisionOutcomeTranslationFingerprint(outcome) ||
        decisionOutcomeTranslationIssues(outcome, translation).length > 0
      );
    }
  );
  return candidates;
}

export async function translateAndUpsertDecisionOutcomes(
  supabase: SupabaseClient,
  outcomes: TranslatableDecisionOutcome[],
  locale: TranslationLocale,
  options: { log?: (message: string) => void } = {}
) {
  const candidates = await getDecisionOutcomesNeedingTranslation(supabase, outcomes, locale);
  if (candidates.length === 0) return 0;

  const { translations, raw } = await generateTranslations(
    {
      locale,
      outcomes: candidates.map((outcome) => ({
        id: outcome.id,
        headline: outcome.headline,
        summary: outcome.summary,
        vote: outcome.vote || null,
        next_step: outcome.next_step || null
      }))
    },
    options
  );
  const outcomeById = new Map(candidates.map((outcome) => [outcome.id, outcome]));
  const now = new Date().toISOString();
  const rows = (translations.outcomes || []).map((translation) => {
    const outcome = outcomeById.get(translation.id);
    if (!outcome) throw new Error(`Unexpected decision outcome translation id ${translation.id}.`);

    return {
      decision_outcome_id: outcome.id,
      locale,
      headline: translation.headline,
      summary: translation.summary,
      vote: translation.vote,
      next_step: translation.next_step,
      source_fingerprint: decisionOutcomeTranslationFingerprint(outcome),
      translation_status: "machine",
      raw_llm_json: raw,
      translated_at: now
    };
  });

  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from("decision_outcome_translations")
    .upsert(rows, { onConflict: "decision_outcome_id,locale" });

  if (error && !isMissingTranslationTable(error)) {
    throw new Error(`Failed to write decision outcome translations: ${error.message}`);
  }
  if (isMissingTranslationTable(error)) {
    const embedded = await loadEmbeddedTranslations(supabase, candidates, locale);
    const translationByOutcomeId = new Map(
      (translations.outcomes || []).map((translation) => [translation.id, translation])
    );
    const fallbackRows = candidates.map((outcome) => {
      const existing = embedded.get(outcome.summary_card_id);
      const translation = translationByOutcomeId.get(outcome.id);
      if (!existing?.source_fingerprint || !translation) {
        throw new Error(
          `Cannot store embedded decision outcome translation for card ${outcome.summary_card_id}.`
        );
      }
      const publicTranslation: PublicDecisionOutcomeTranslation = {
        headline: translation.headline,
        summary: translation.summary,
        vote: translation.vote,
        next_step: translation.next_step,
        source_fingerprint: decisionOutcomeTranslationFingerprint(outcome)
      };
      return {
        summary_card_id: outcome.summary_card_id,
        locale,
        source_fingerprint: existing.source_fingerprint,
        raw_llm_json: withEmbeddedDecisionOutcomeTranslation(
          existing.raw_llm_json,
          publicTranslation
        )
      };
    });
    const { error: fallbackError } = await supabase
      .from("summary_card_translations")
      .upsert(fallbackRows, { onConflict: "summary_card_id,locale" });
    if (fallbackError) {
      throw new Error(`Failed to write embedded outcome translations: ${fallbackError.message}`);
    }
  }
  return rows.length;
}
