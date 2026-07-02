import { Layers3 } from "lucide-react";
import { CategoryPill } from "@/components/CategoryPill";
import { PendingLink } from "@/components/PendingLink";
import {
  CATEGORIES,
  CATEGORY_DEFINITIONS,
  type CategoryName
} from "@/lib/constants";
import { type Locale, t } from "@/lib/i18n";

function categoryHref(category: CategoryName | null, search: string, jurisdiction?: string) {
  const params = new URLSearchParams();
  if (jurisdiction) params.set("jurisdiction", jurisdiction);
  if (search) params.set("q", search);
  if (category) params.set("category", CATEGORY_DEFINITIONS[category].slug);
  const query = params.toString();
  return `/decisions${query ? `?${query}` : ""}`;
}

export function DecisionCategorySelector({
  selectedCategory,
  search,
  jurisdiction,
  locale = "en"
}: {
  selectedCategory?: CategoryName;
  search: string;
  jurisdiction?: string;
  locale?: Locale;
}) {
  return (
    <nav aria-label={t(locale, "filterByTopic")} className="border-b border-black/10 py-5">
      <p className="mb-3 text-sm font-bold text-ink">{t(locale, "filterByTopic")}</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
        <PendingLink
          href={categoryHref(null, search, jurisdiction)}
          aria-current={!selectedCategory ? "true" : undefined}
          pendingLabel={locale === "es" ? "Mostrando todos los temas" : "Showing all topics"}
          className={`chip chip-lg ${!selectedCategory ? "chip-selected" : ""}`}
        >
          <Layers3 aria-hidden className="h-4 w-4 shrink-0" />
          <span>{t(locale, "allTopics")}</span>
        </PendingLink>
        {CATEGORIES.map((category) => (
          <CategoryPill
            key={category}
            category={category}
            href={categoryHref(category, search, jurisdiction)}
            large
            selected={selectedCategory === category}
            locale={locale}
          />
        ))}
      </div>
    </nav>
  );
}
