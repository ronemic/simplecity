import { Search } from "lucide-react";
import { CategoryPill } from "@/components/CategoryPill";
import { CATEGORIES, CATEGORY_DEFINITIONS } from "@/lib/constants";

export function SearchAndFilters({
  search = "",
  activeCategory
}: {
  search?: string;
  activeCategory?: string;
}) {
  return (
    <div className="space-y-4">
      <form className="quiet-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4" action="/" role="search">
        <label className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/50" />
          <span className="sr-only">Search agenda cards</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="Search agenda items, impacts, meetings..."
            className="input-control input-control--with-icon"
          />
        </label>
        <button className="action-primary sm:px-6">
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2 rounded-lg border border-black/10 bg-white p-2 shadow-sm">
        {CATEGORIES.map((category) => {
          const href = `/categories/${CATEGORY_DEFINITIONS[category].slug}`;
          return (
            <CategoryPill
              key={category}
              category={category}
              href={href}
              compact={activeCategory !== category}
            />
          );
        })}
      </div>
    </div>
  );
}
