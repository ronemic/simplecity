/**
 * Detects Spanish translation fields that were left in English.
 *
 * Counts function words rather than vocabulary, so preserved proper names
 * ("Board of Supervisors", "Hillsdale High School") inside an otherwise Spanish
 * sentence don't trip it: a Spanish sentence brings its own el/la/de/que.
 */
const ENGLISH_FUNCTION_WORDS =
  /\b(?:the|and|of|to|for|with|will|would|this|that|these|from|which|are|is|was|were|be|been|has|have|by|on|at|an|or|its|their|who|should|may|can|into|than)\b/gi;
const SPANISH_FUNCTION_WORDS =
  /(?:^|[^\p{L}])(?:el|la|los|las|de|del|y|para|con|que|por|un|una|unos|unas|se|en|es|son|sobre|al|su|sus|lo|como|más|este|esta|estos|estas|será|serán|entre|desde|hasta)(?=$|[^\p{L}])/giu;

const MIN_WORDS = 6;
const MIN_ENGLISH_FUNCTION_WORDS = 3;
const ENGLISH_TO_SPANISH_RATIO = 2;

export function looksUntranslatedEnglish(text: string | null | undefined) {
  const value = String(text || "").trim();
  if (value.split(/\s+/).length < MIN_WORDS) return false;
  const english = value.match(ENGLISH_FUNCTION_WORDS)?.length || 0;
  if (english < MIN_ENGLISH_FUNCTION_WORDS) return false;
  const spanish = value.match(SPANISH_FUNCTION_WORDS)?.length || 0;
  return english > spanish * ENGLISH_TO_SPANISH_RATIO;
}

/**
 * Field names of a card translation (snake_case row or camelCase LLM shape,
 * nested objects included) whose text still reads as English. status is skipped
 * because it intentionally stays the English enum.
 */
export function untranslatedEnglishCardFields(translation: unknown, prefix = ""): string[] {
  if (!translation || typeof translation !== "object" || Array.isArray(translation)) return [];
  const fields: string[] = [];
  for (const [key, value] of Object.entries(translation)) {
    if (key === "status") continue;
    const field = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      fields.push(...untranslatedEnglishCardFields(value, field));
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    if (values.some((entry) => typeof entry === "string" && looksUntranslatedEnglish(entry))) {
      fields.push(field);
    }
  }
  return fields;
}
