import { notFound } from "next/navigation";
import { SummaryCard } from "@/components/SummaryCard";
import { CategoryPill } from "@/components/CategoryPill";
import { PendingLink } from "@/components/PendingLink";
import { CATEGORY_DEFINITIONS, CATEGORIES } from "@/lib/constants";
import { getCategoryCards } from "@/lib/db/queries";

export const revalidate = 300;

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
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-civic/10 text-civic shadow-sm">
          <Icon aria-hidden className="h-6 w-6" />
        </span>
        <h1 className="page-title mt-4">{category}</h1>
        <p className="page-copy mt-3 text-base">{definition.description}</p>
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
          <PendingLink
            key={item.href}
            href={item.href}
            className="action-secondary px-4 py-2"
            pendingLabel={`Loading ${item.label.toLowerCase()}`}
            mode="overlay"
          >
            {item.label}
          </PendingLink>
        ))}
      </div>

      <div className="grid gap-4">
        {filtered.map((card) => (
          <SummaryCard key={card.id} card={card} />
        ))}
        {filtered.length === 0 ? (
          <div className="quiet-card p-8 text-center">
            <h2 className="text-xl font-bold text-ink">No cards in this category yet</h2>
            <p className="mt-2 text-sm leading-6 text-black/70">
              Cards will appear here once official agenda items are scraped and summarized.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
