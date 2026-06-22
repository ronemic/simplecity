import { Layers3 } from "lucide-react";
import { CategoryPill } from "@/components/CategoryPill";
import { PendingLink } from "@/components/PendingLink";
import {
  CATEGORIES,
  CATEGORY_DEFINITIONS,
  type CategoryName
} from "@/lib/constants";

function categoryHref(category: CategoryName | null, search: string) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (category) params.set("category", CATEGORY_DEFINITIONS[category].slug);
  const query = params.toString();
  return `/decisions${query ? `?${query}` : ""}`;
}

export function DecisionCategorySelector({
  selectedCategory,
  search
}: {
  selectedCategory?: CategoryName;
  search: string;
}) {
  return (
    <nav aria-label="Filter decisions by category" className="border-b border-black/10 py-5">
      <p className="mb-3 text-sm font-bold text-ink">Filter by topic</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
        <PendingLink
          href={categoryHref(null, search)}
          aria-current={!selectedCategory ? "true" : undefined}
          pendingLabel="Showing all categories"
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold shadow-sm transition focus-visible:focus-ring ${
            !selectedCategory
              ? "border-civic/35 bg-civic/10 text-civic hover:bg-civic/15"
              : "border-black/15 bg-white text-black/75 hover:bg-black/[0.03]"
          }`}
        >
          <Layers3 aria-hidden className="h-4 w-4 shrink-0" />
          <span>All topics</span>
        </PendingLink>
        {CATEGORIES.map((category) => (
          <CategoryPill
            key={category}
            category={category}
            href={categoryHref(category, search)}
            large
            selected={selectedCategory === category}
          />
        ))}
      </div>
    </nav>
  );
}
