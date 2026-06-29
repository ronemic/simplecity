import { notFound } from "next/navigation";
import { SummaryCard } from "@/components/SummaryCard";
import { CategoryPill } from "@/components/CategoryPill";
import { PendingLink } from "@/components/PendingLink";
import { CATEGORY_DEFINITIONS, CATEGORIES } from "@/lib/constants";
import { getCategoryCards } from "@/lib/db/queries";
import { cookies } from "next/headers";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { categoryDescription, categoryLabel, t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export const revalidate = 300;

function categoryFromSlug(slug: string) {
  return CATEGORIES.find((category) => CATEGORY_DEFINITIONS[category].slug === slug);
}

export default async function CategoryDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ period?: string; jurisdiction?: string }>;
}) {
  const [{ category: slug }, query] = await Promise.all([params, searchParams]);
  const locale = await getRequestLocale();
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const cookieStore = await cookies();
  const jurisdiction = normalizeJurisdictionSelection(
    query.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const jurisdictionParam = query.jurisdiction
    ? `jurisdiction=${encodeURIComponent(toPublicJurisdictionSlug(jurisdiction))}`
    : "";
  const definition = CATEGORY_DEFINITIONS[category];
  const cards = await getCategoryCards(category, jurisdiction, locale);
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
        <h1 className="page-title mt-4">{categoryLabel(locale, category)}</h1>
        <p className="page-copy mt-3 text-base">{categoryDescription(locale, category)}</p>
        <div className="mt-4">
          <CategoryPill category={category} locale={locale} />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          {
            href: `/topics/${slug}${jurisdictionParam ? `?${jurisdictionParam}` : ""}`,
            label: t(locale, "all")
          },
          {
            href: `/topics/${slug}?${[
              jurisdictionParam,
              "period=upcoming"
            ].filter(Boolean).join("&")}`,
            label: t(locale, "upcoming")
          },
          {
            href: `/topics/${slug}?${[
              jurisdictionParam,
              "period=past"
            ].filter(Boolean).join("&")}`,
            label: t(locale, "past")
          }
        ].map((item) => (
          <PendingLink
            key={item.href}
            href={item.href}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-black/75 shadow-sm transition hover:bg-black/[0.03] focus-visible:focus-ring whitespace-nowrap"
            pendingLabel={`${t(locale, "loading")} ${item.label.toLowerCase()}`}
          >
            {item.label}
          </PendingLink>
        ))}
      </div>

      <div className="grid gap-4">
        {filtered.map((card) => (
          <SummaryCard key={card.id} card={card} locale={locale} />
        ))}
        {filtered.length === 0 ? (
          <div className="quiet-card p-8 text-center">
            <h2 className="text-xl font-bold text-ink">{t(locale, "noCardsInCategory")}</h2>
            <p className="mt-2 text-sm leading-6 text-black/70">
              {t(locale, "noCardsInCategoryDescription")}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
