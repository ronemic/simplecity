import Link from "next/link";
import { SummaryCard } from "@/components/SummaryCard";
import { getPublishedCards } from "@/lib/db/queries";
import {
  getJurisdictionLabel,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
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
    jurisdiction?: string;
  }>;
}) {
  const params = await searchParams;
  const jurisdiction = normalizeJurisdictionSelection(params.jurisdiction);
  const publicJurisdiction = toPublicJurisdictionSlug(jurisdiction);
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
          Read plain-language summaries of decisions being made by local government, ranked by community impact.
        </p>
      </div>

      <form className="quiet-card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:p-5">
        <input type="hidden" name="jurisdiction" value={publicJurisdiction} />
        <input
          name="q"
          defaultValue={params.q || ""}
          placeholder="Search decisions..."
          className="input-control"
        />
        <button className="action-primary">Filter</button>
      </form>

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
