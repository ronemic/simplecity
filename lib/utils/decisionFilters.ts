import { CATEGORIES, CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import type { SummaryCardRow } from "@/lib/types";

export function categoryFromSlug(slug: string | null | undefined): CategoryName | undefined {
  return CATEGORIES.find((category) => CATEGORY_DEFINITIONS[category].slug === slug);
}

export function matchesDecisionFilters(
  card: SummaryCardRow,
  search: string,
  category?: CategoryName
) {
  if (category && !(card.category_tags || []).includes(category)) return false;
  if (!search) return true;

  const haystack = [
    card.agenda_item,
    card.what_is_happening,
    card.why_it_matters,
    card.meetings?.title
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}
