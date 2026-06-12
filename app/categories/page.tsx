import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CATEGORY_DEFINITIONS, CATEGORIES } from "@/lib/constants";
import {
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";

export default async function CategoriesPage({
  searchParams
}: {
  searchParams: Promise<{ jurisdiction?: string }>;
}) {
  const params = await searchParams;
  const jurisdiction = normalizeJurisdictionSelection(params.jurisdiction);
  const publicJurisdiction = toPublicJurisdictionSlug(jurisdiction);

  return (
    <div className="section-shell py-10">
      <div className="mb-8 max-w-3xl">
        <p className="label-eyebrow text-civic">Categories</p>
        <h1 className="page-title mt-2">Find decisions by everyday impact</h1>
        <p className="page-copy mt-3 text-base">
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
              href={`/categories/${definition.slug}?jurisdiction=${publicJurisdiction}`}
              className="quiet-card group block p-5 transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(23,23,23,0.12)] focus-visible:focus-ring"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-civic/10 text-civic shadow-sm">
                <Icon aria-hidden className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-xl font-bold text-ink">{category}</h2>
              <p className="mt-2 text-sm leading-6 text-black/70">{definition.description}</p>
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
