import { decisionOutcomeTranslationFingerprint } from "@/lib/db/translationFingerprint";
import type { DecisionOutcome, DecisionOutcomeTranslationRow } from "@/lib/types";

export type PublicDecisionOutcomeTranslation = Pick<
  DecisionOutcomeTranslationRow,
  "headline" | "summary" | "vote" | "next_step" | "source_fingerprint"
>;

type DecisionOutcomeSourceCopy = Pick<
  DecisionOutcome,
  "headline" | "summary" | "vote" | "next_step"
>;

type DecisionOutcomeTranslatedCopy = Pick<
  PublicDecisionOutcomeTranslation,
  "headline" | "summary" | "vote" | "next_step"
>;

const UNTRANSLATED_ENGLISH_PHRASE_PATTERN =
  /\b(?:the official|this item|motion and second|to approve|passed(?: unanimously)?|no action(?: taken)?|city council|public hearing|informational items?|regular meeting|approved minutes|staff report|commissioners voted|council directed staff|linked staff report context|subject to the provisions)\b/i;

const ENGLISH_OUTCOME_WORDS = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "as",
  "and",
  "of",
  "for",
  "with",
  "was",
  "were",
  "is",
  "are",
  "item",
  "motion",
  "second",
  "passed",
  "approve",
  "approved",
  "action",
  "council",
  "staff",
  "hearing",
  "years",
  "proceed",
  "directed",
  "calendar",
  "commission",
  "commissioners",
  "regular",
  "meeting",
  "minutes",
  "page",
  "city",
  "adopt",
  "authorize",
  "initiation",
  "process",
  "preparation",
  "next",
  "fiscal",
  "absent",
  "informational",
  "report",
  "context",
  "subject",
  "provisions",
  "environmental",
  "quality"
]);

function normalizeComparableText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function isNumericVote(value: string) {
  return /^\s*\d{1,2}(?:\s*[-–—]\s*\d{1,2}){1,2}\s*$/.test(value);
}

function hasSubstantialUntranslatedEnglish(value: string) {
  if (UNTRANSLATED_ENGLISH_PHRASE_PATTERN.test(value)) return true;
  const words = value.toLocaleLowerCase("en-US").match(/[a-z]+/g) || [];
  let englishWords = 0;
  for (const word of words) {
    if (ENGLISH_OUTCOME_WORDS.has(word)) englishWords += 1;
  }
  return englishWords >= 3;
}

export function canonicalizeDecisionOutcomeTranslation<
  T extends DecisionOutcomeTranslatedCopy
>(source: DecisionOutcomeSourceCopy, translation: T): T {
  if (normalizeComparableText(source.headline) !== "no action taken") {
    return translation;
  }

  const exactNoActionSummary =
    normalizeComparableText(source.summary) ===
    "the official minutes record this item as no action.";
  return {
    ...translation,
    headline: "No se tomó ninguna medida",
    summary: exactNoActionSummary
      ? "El acta oficial registra que no se tomó ninguna medida sobre este punto."
      : translation.summary
  };
}

export function decisionOutcomeTranslationIssues(
  source: DecisionOutcomeSourceCopy,
  translation: DecisionOutcomeTranslatedCopy
) {
  const issues: string[] = [];
  const fields = ["headline", "summary", "vote", "next_step"] as const;
  const normalizedTranslation = canonicalizeDecisionOutcomeTranslation(
    source,
    translation
  );

  for (const field of fields) {
    const sourceValue = source[field];
    const translatedValue = normalizedTranslation[field];
    if (sourceValue === null || sourceValue === undefined) {
      if (translatedValue !== null && translatedValue !== undefined) {
        issues.push(`${field} changed a null source value`);
      }
      continue;
    }
    if (
      translatedValue === null ||
      translatedValue === undefined ||
      translatedValue.trim().length === 0
    ) {
      issues.push(`${field} was omitted`);
      continue;
    }

    const unchanged =
      normalizeComparableText(sourceValue) === normalizeComparableText(translatedValue);
    if (unchanged && !(field === "vote" && isNumericVote(sourceValue))) {
      issues.push(`${field} was left in English`);
      continue;
    }
    if (hasSubstantialUntranslatedEnglish(translatedValue)) {
      issues.push(`${field} contains untranslated English`);
    }
  }

  return issues;
}

export const EMBEDDED_DECISION_OUTCOME_TRANSLATION_KEY =
  "simplecity_decision_outcome_translation";

export function readEmbeddedDecisionOutcomeTranslation(
  raw: unknown
): PublicDecisionOutcomeTranslation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = (raw as Record<string, unknown>)[
    EMBEDDED_DECISION_OUTCOME_TRANSLATION_KEY
  ];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const translation = candidate as Record<string, unknown>;
  if (
    typeof translation.headline !== "string" ||
    typeof translation.summary !== "string" ||
    typeof translation.source_fingerprint !== "string" ||
    (translation.vote !== null && typeof translation.vote !== "string") ||
    (translation.next_step !== null && typeof translation.next_step !== "string")
  ) {
    return null;
  }

  return {
    headline: translation.headline,
    summary: translation.summary,
    vote: translation.vote as string | null,
    next_step: translation.next_step as string | null,
    source_fingerprint: translation.source_fingerprint
  };
}

export function withEmbeddedDecisionOutcomeTranslation(
  raw: unknown,
  translation: PublicDecisionOutcomeTranslation
) {
  const base = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    ...base,
    [EMBEDDED_DECISION_OUTCOME_TRANSLATION_KEY]: translation
  };
}

export function applyDecisionOutcomeTranslation(
  outcome: DecisionOutcome,
  translation?: PublicDecisionOutcomeTranslation | null
): DecisionOutcome {
  const normalizedTranslation = translation
    ? canonicalizeDecisionOutcomeTranslation(outcome, translation)
    : null;
  if (
    !normalizedTranslation ||
    normalizedTranslation.source_fingerprint !== decisionOutcomeTranslationFingerprint(outcome) ||
    decisionOutcomeTranslationIssues(outcome, normalizedTranslation).length > 0
  ) {
    return outcome;
  }

  return {
    ...outcome,
    headline: normalizedTranslation.headline,
    summary: normalizedTranslation.summary,
    vote: normalizedTranslation.vote,
    next_step: normalizedTranslation.next_step
  };
}
