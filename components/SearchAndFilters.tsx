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
    <div className="space-y-3">
      <form className="flex w-full max-w-[560px] flex-col gap-2 rounded-lg border border-black/10 bg-white p-1.5 shadow-soft sm:flex-row sm:items-center" action="/" role="search">
        <label className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-black/50" />
          <span className="sr-only">Search agenda cards</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="Search agenda items, impacts, meetings..."
            className="input-control input-control--with-icon input-control--hero-search border-transparent text-sm shadow-none focus:border-civic"
          />
        </label>
        <button className="action-primary min-h-10 px-4 py-2 sm:px-5">
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
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
