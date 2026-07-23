"use client";

import { Layers3 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { CategoryPill } from "@/components/CategoryPill";
import { PendingLink } from "@/components/PendingLink";
import { CATEGORIES, CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import type { Locale } from "@/lib/i18n";

export function DecisionFilters({
  selectedCategory,
  locale
}: {
  selectedCategory?: CategoryName;
  locale: Locale;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function categoryHref(category?: CategoryName) {
    const params = new URLSearchParams(searchParams.toString());
    if (category) params.set("category", CATEGORY_DEFINITIONS[category].slug);
    else params.delete("category");
    params.delete("page");
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }

  return (
    <section aria-label={locale === "es" ? "Filtros de decisiones" : "Decision filters"}>
      <nav aria-label={locale === "es" ? "Filtrar por tema" : "Filter by topic"} className="border-b border-black/10 py-5">
        <p className="mb-3 text-sm font-bold text-ink">
          {locale === "es" ? "Filtrar por tema" : "Filter by topic"}
        </p>
        <div className="flex gap-2.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          <PendingLink
            href={categoryHref()}
            aria-current={!selectedCategory ? "true" : undefined}
            pendingLabel={locale === "es" ? "Mostrando todos los temas" : "Showing all topics"}
            className={`chip chip-action chip-lg ${!selectedCategory ? "chip-selected" : ""}`}
          >
            <Layers3 aria-hidden className="h-4 w-4 shrink-0" />
            <span>{locale === "es" ? "Todos los temas" : "All topics"}</span>
          </PendingLink>
          {CATEGORIES.map((category) => (
            <CategoryPill
              key={category}
              category={category}
              href={categoryHref(category)}
              large
              selected={selectedCategory === category}
              locale={locale}
            />
          ))}
        </div>
      </nav>

    </section>
  );
}
