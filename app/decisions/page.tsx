import { SummaryCard } from "@/components/SummaryCard";
import { DecisionSearchForm } from "@/components/DecisionSearchForm";
import { getPublishedCards } from "@/lib/db/queries";
import { cookies } from "next/headers";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionLabel,
  normalizeJurisdictionSelection
} from "@/lib/config/jurisdictions";
import {
  compareCardsByPublicInterest
} from "@/lib/utils/civicPriority";
import type { SummaryCardRow } from "@/lib/types";

export const revalidate = 300;

function matchesSearch(card: SummaryCardRow, search: string) {
  if (!search) return true;
  const haystack = [
    card.agenda_item,
    card.what_is_happening,
    card.why_it_matters,
    card.meetings?.title,
    ...(card.category_tags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

export default async function DecisionsPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
  }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const jurisdiction = normalizeJurisdictionSelection(
    cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const search = (params.q || "").trim();

  const cards = await getPublishedCards(jurisdiction);
  const filteredCards = cards.filter((card) => matchesSearch(card, search));
  const prioritizedCards = [...filteredCards].sort(compareCardsByPublicInterest);

  return (
    <div className="section-shell py-10">
      <div className="mb-6 max-w-3xl">
        <p className="label-eyebrow text-civic">Decisions</p>
        <h1 className="page-title mt-2">{jurisdictionLabel} decisions</h1>
        <p className="page-copy mt-3 text-base">
          Read plain-language summaries of decisions being made by local government, ranked to show upcoming decisions first and then by recency and community impact.
        </p>
      </div>

      <DecisionSearchForm search={params.q || ""} />

      <div className="grid gap-3">
        {prioritizedCards.map((card) => (
          <SummaryCard key={card.id} card={card} />
        ))}
        {filteredCards.length === 0 ? (
          <div className="quiet-card p-8 text-center">
            <h3 className="text-lg font-semibold text-ink">
              {search ? "No matching decisions" : "No decisions yet"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-black/70">
              {search
                ? "Try searching for a different topic, department, or keyword."
                : `Official ${jurisdictionLabel} agenda cards will appear here once meetings are scraped.`}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
