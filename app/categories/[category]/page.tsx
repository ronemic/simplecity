import { notFound } from "next/navigation";
import { SummaryCard } from "@/components/SummaryCard";
import { CategoryPill } from "@/components/CategoryPill";
import { CATEGORY_DEFINITIONS, CATEGORIES } from "@/lib/constants";
import { getCategoryCards } from "@/lib/db/queries";

function categoryFromSlug(slug: string) {
  return CATEGORIES.find((category) => CATEGORY_DEFINITIONS[category].slug === slug);
}

export default async function CategoryDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const [{ category: slug }, query] = await Promise.all([params, searchParams]);
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const definition = CATEGORY_DEFINITIONS[category];
  const cards = await getCategoryCards(category);
  const filtered =
    query.period === "upcoming"
      ? cards.filter((card) => card.status === "Upcoming vote" || card.meetings?.status === "Upcoming")
      : query.period === "past"
        ? cards.filter((card) => card.meetings?.status === "Past")
        : cards;

  const Icon = definition.icon;

  return (
    <div className="section-shell py-10">
      <div className="mb-8 max-w-3xl">
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-civic/10 text-civic">
          <Icon aria-hidden className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-4xl font-black text-ink">{category}</h1>
        <p className="mt-3 text-base leading-7 text-black/65">{definition.description}</p>
        <div className="mt-4">
          <CategoryPill category={category} />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { href: `/categories/${slug}`, label: "All" },
          { href: `/categories/${slug}?period=upcoming`, label: "Upcoming" },
          { href: `/categories/${slug}?period=past`, label: "Past" }
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-bold transition hover:bg-black/5 focus-visible:focus-ring"
          >
            {item.label}
          </a>
        ))}
      </div>

      <div className="grid gap-4">
        {filtered.map((card) => (
          <SummaryCard key={card.id} card={card} />
        ))}
        {filtered.length === 0 ? (
          <div className="quiet-card p-8 text-center">
            <h2 className="text-lg font-semibold text-ink">No cards in this category yet</h2>
            <p className="mt-2 text-sm leading-6 text-black/60">
              Cards will appear here once official agenda items are scraped and summarized.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
