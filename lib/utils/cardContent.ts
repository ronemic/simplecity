import { normalizeSummaryPoints, type SummaryPointsValue } from "@/lib/utils/summaryPoints";

/**
 * The summary prompt fills unavailable fields with a fixed placeholder rather
 * than inventing content. When every substantive field carries it the card
 * conveys nothing, so it must not reach the public site.
 */
export const MISSING_SOURCE_VALUES = [
  "Not listed in the source document.",
  "No indicado en el documento fuente."
];

export function isMissingSourceValue(value: unknown) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.]+$/, "");
  if (!text) return true;
  return MISSING_SOURCE_VALUES.some(
    (placeholder) => placeholder.toLowerCase().replace(/[.]+$/, "") === text
  );
}

/**
 * A card is publishable when at least one of its two substantive body fields
 * says something the source actually supported. Participation boilerplate and
 * the agenda title are excluded deliberately: both are present even on cards
 * whose body the model could not fill in.
 */
export function hasPublishableCardContent(card: {
  whatIsHappening?: SummaryPointsValue;
  whyItMatters?: string | null;
}) {
  const points = normalizeSummaryPoints(card.whatIsHappening).filter(
    (point) => !isMissingSourceValue(point)
  );
  if (points.length > 0) return true;
  return !isMissingSourceValue(card.whyItMatters);
}
