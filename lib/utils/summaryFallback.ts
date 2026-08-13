/**
 * Cards where summarization did not produce a usable summary, so the card falls
 * back to showing the official agenda text verbatim.
 *
 * Kept here rather than inside the card component because ranking needs it too: a
 * card with no plain-language summary is a poor fit for "decisions that may affect
 * daily life", which is a promise of exactly that summary.
 */
export type OfficialSourceFallbackReason =
  | "validation_failed"
  | "generation_failed"
  | "summary_omitted"
  | "legacy";

export const OFFICIAL_SOURCE_FALLBACK_REASONS = new Map<string, OfficialSourceFallbackReason>([
  [
    "SimpleCity could not verify a generated summary for this item. The official agenda text is shown instead.",
    "validation_failed"
  ],
  [
    "SimpleCity no pudo verificar un resumen generado para este punto. En su lugar, se muestra el texto de la agenda oficial.",
    "validation_failed"
  ],
  [
    "SimpleCity could not generate a summary for this item. The official agenda text is shown instead.",
    "generation_failed"
  ],
  [
    "SimpleCity no pudo generar un resumen para este punto. En su lugar, se muestra el texto de la agenda oficial.",
    "generation_failed"
  ],
  [
    "This item was omitted from the generated summary. The official agenda text is shown instead.",
    "summary_omitted"
  ],
  [
    "Este punto se omitió del resumen generado. En su lugar, se muestra el texto de la agenda oficial.",
    "summary_omitted"
  ],
  [
    "A detailed SimpleCity summary is still being prepared. The official agenda item is available now so it is not omitted.",
    "legacy"
  ],
  [
    "SimpleCity todavía está preparando un resumen detallado. El punto de la agenda oficial está disponible ahora para que no se omita.",
    "legacy"
  ]
]);

export function officialSourceFallbackReason(whyItMatters?: string | null) {
  return OFFICIAL_SOURCE_FALLBACK_REASONS.get(String(whyItMatters || "").trim()) || null;
}
