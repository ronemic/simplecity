const LARGE_SOURCE_FIELDS = new Set([
  "detailText",
  "extractedText",
  "htmlAgendaText",
  "llmInputText",
  "publicCommentsInputText"
]);

/**
 * Keep the workflow diagnostic useful without copying complete source documents
 * into pipeline-result.json. The source text is already persisted separately.
 */
export function serializePipelineResult(result: unknown) {
  return JSON.stringify(
    result,
    (key, value) => (LARGE_SOURCE_FIELDS.has(key) ? undefined : value),
    2
  );
}
