import { CATEGORIES, CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import type { Locale } from "@/lib/i18n";
import type { SummaryCardRow } from "@/lib/types";
import { publicAgendaTitle } from "@/lib/utils/civicPriority";
import { formatCompactDisplayDate } from "@/lib/utils/date";
import { displayMeetingType } from "@/lib/utils/meetingDisplay";
import { normalizeSummaryPoints } from "@/lib/utils/summaryPoints";

export function categoryFromSlug(slug: string | null | undefined): CategoryName | undefined {
  return CATEGORIES.find((category) => CATEGORY_DEFINITIONS[category].slug === slug);
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

export function matchesNormalizedDecisionSearchText(value: string, search: string) {
  const haystackTokens = normalizeDecisionSearchText(value).split(" ").filter(Boolean);
  const searchTokens = normalizeDecisionSearchText(search).split(" ").filter(Boolean);

  if (searchTokens.length === 0) return true;
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

export function matchesDecisionFilters(
  card: SummaryCardRow,
  search: string,
  category?: CategoryName,
  locale: Locale = "en"
) {
  if (category && !(card.category_tags || []).includes(category)) return false;
  if (!search) return true;

  const meeting = card.meetings;
  const visibleFields = [
    publicAgendaTitle(card),
    ...normalizeSummaryPoints(card.what_is_happening),
    card.why_it_matters,
    meeting
      ? displayMeetingType(
          meeting,
          locale === "es" ? "Grupo no indicado" : "Group not listed",
          locale
        )
      : "",
    formatCompactDisplayDate(meeting?.date_text, meeting?.meeting_datetime)
  ].filter(Boolean);

  return visibleFields.some((field) => matchesNormalizedDecisionSearchText(String(field), search));
}
