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
      <form className="flex flex-col gap-3 sm:flex-row" action="/" role="search">
        <label className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-black/45" />
          <span className="sr-only">Search agenda cards</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="Search agenda items, impacts, meetings..."
            className="min-h-12 w-full rounded-md border border-black/15 bg-white pl-10 pr-4 text-base outline-none transition placeholder:text-black/40 focus:border-civic focus:ring-2 focus:ring-civic/20"
          />
        </label>
        <button className="min-h-12 rounded-md bg-civic px-5 text-sm font-bold text-white transition hover:bg-[#1c4788] focus-visible:focus-ring">
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
