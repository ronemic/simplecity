import { CATEGORIES, CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import type { SummaryCardRow } from "@/lib/types";
import { publicAgendaTitle } from "@/lib/utils/civicPriority";
import { normalizeSummaryPoints } from "@/lib/utils/summaryPoints";
import {
  matchesDecisionResultFilter,
  type DecisionResultFilter
} from "@/lib/utils/decisionResultFilter";

export function categoryFromSlug(
  slug: string | null | undefined,
  categories: readonly CategoryName[] = CATEGORIES
): CategoryName | undefined {
  return categories.find((category) => CATEGORY_DEFINITIONS[category].slug === slug);
}

export const DECISION_PERIODS = ["upcoming", "past"] as const;
export type DecisionPeriod = (typeof DECISION_PERIODS)[number];

export function decisionPeriodFromParam(value: string | null | undefined): DecisionPeriod | undefined {
  return DECISION_PERIODS.find((period) => period === value);
}

/**
 * "upcoming" is calendar order; "newest" is the latest meeting date first.
 * Also the order the sort buttons appear in on every page.
 */
export const DECISION_SORTS = ["upcoming", "newest"] as const;
export type DecisionSort = (typeof DECISION_SORTS)[number];

export function decisionSortFromParam(value: string | null | undefined): DecisionSort | undefined {
  return DECISION_SORTS.find((sort) => sort === value);
}

/**
 * Expects `card.meetings.status` to already be the effective status (see
 * withEffectiveMeetingStatus). The paged database query mirrors this rule.
 */
export function matchesDecisionPeriod(card: SummaryCardRow, period?: DecisionPeriod) {
  if (period === "upcoming") {
    return card.status === "Upcoming vote" || card.meetings?.status === "Upcoming";
  }
  if (period === "past") return card.meetings?.status === "Past";
  return true;
}

export function normalizeDecisionSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words of a search (or of any text), normalized the way search compares them. */
export function decisionSearchTokens(value: string) {
  return normalizeDecisionSearchText(value).split(" ").filter(Boolean);
}

/**
 * Whether already-normalized text contains the search words as consecutive
 * words. `normalizedValue` must come from normalizeDecisionSearchText and
 * `searchTokens` from decisionSearchTokens.
 */
export function normalizedTextMatchesSearchTokens(
  normalizedValue: string,
  searchTokens: readonly string[]
) {
  if (searchTokens.length === 0) return true;
  // Every search word has to appear inside some word of the text, so a text
  // that lacks one of them as a plain substring cannot match. This skips the
  // word-by-word scan for almost every card.
  if (!searchTokens.every((searchToken) => normalizedValue.includes(searchToken))) return false;

  const haystackTokens = normalizedValue.split(" ").filter(Boolean);
  if (haystackTokens.length < searchTokens.length) return false;

  return haystackTokens.some((_, startIndex) =>
    searchTokens.every((searchToken, tokenIndex) => {
      const haystackToken = haystackTokens[startIndex + tokenIndex];
      if (!haystackToken) return false;

      // Numbers represent complete values (for example, day 4 must not match day 24).
      if (/^\d+$/u.test(searchToken)) return haystackToken === searchToken;
      return haystackToken.includes(searchToken);
    })
  );
}

export function matchesNormalizedDecisionSearchText(value: string, search: string) {
  return normalizedTextMatchesSearchTokens(
    normalizeDecisionSearchText(value),
    decisionSearchTokens(search)
  );
}

export function decisionMeetingSearchFilters(pattern: string) {
  return [
    `meeting_type.ilike.${pattern}`,
    `date_text.ilike.${pattern}`
  ].join(",");
}

export function decisionCardSearchFilters(pattern: string, meetingIds: string[]) {
  const filters = [
    `agenda_item.ilike.${pattern}`,
    `what_is_happening.ilike.${pattern}`,
    `why_it_matters.ilike.${pattern}`
  ];

  if (meetingIds.length > 0) {
    filters.push(`meeting_id.in.(${meetingIds.join(",")})`);
  }

  return filters.join(",");
}

/**
 * The text a reader can see on a card, normalized for search. Normalizing is
 * the expensive part of matching, so the search index computes this once per
 * card and reuses it for every search.
 */
export function normalizedDecisionSearchFields(card: SummaryCardRow) {
  return [
    publicAgendaTitle(card),
    ...normalizeSummaryPoints(card.what_is_happening),
    card.why_it_matters,
    ...(card.who_it_affects || [])
  ]
    .filter(Boolean)
    .map((field) => normalizeDecisionSearchText(String(field)));
}

export function matchesDecisionFilters(
  card: SummaryCardRow,
  search: string,
  category?: CategoryName,
  result?: DecisionResultFilter
) {
  if (category && !(card.category_tags || []).includes(category)) return false;
  if (!matchesDecisionResultFilter(card, result)) return false;
  if (!search) return true;

  const searchTokens = decisionSearchTokens(search);
  return normalizedDecisionSearchFields(card).some((field) =>
    normalizedTextMatchesSearchTokens(field, searchTokens)
  );
}
