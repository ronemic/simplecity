import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CATEGORY_DEFINITIONS, CATEGORIES } from "@/lib/constants";

export default function CategoriesPage() {
  return (
    <div className="section-shell py-10">
      <div className="mb-8 max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-civic">Categories</p>
        <h1 className="mt-2 text-4xl font-black text-ink">Find decisions by everyday impact</h1>
        <p className="mt-3 text-base leading-7 text-black/65">
          SimpleCity tags agenda items by the parts of daily life they are most likely to affect.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((category) => {
          const definition = CATEGORY_DEFINITIONS[category];
          const Icon = definition.icon;
          return (
            <Link
              key={category}
              href={`/categories/${definition.slug}`}
              className="quiet-card group p-5 transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:focus-ring"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-civic/10 text-civic">
                <Icon aria-hidden className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-ink">{category}</h2>
              <p className="mt-2 text-sm leading-6 text-black/62">{definition.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-civic">
                View cards <ArrowRight aria-hidden className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
