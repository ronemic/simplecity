import Link from "next/link";
import { ArrowRight, Mail, MapPin, MessageSquareText } from "lucide-react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { SearchAndFilters } from "@/components/SearchAndFilters";
import { SummaryCard } from "@/components/SummaryCard";
import { getActiveAnnouncements, getPublishedCards } from "@/lib/db/queries";
import type { SummaryCardRow } from "@/lib/types";

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

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const search = params.q || "";
  const [cards, announcements] = await Promise.all([getPublishedCards(), getActiveAnnouncements()]);
  const filteredCards = cards.filter((card) => matchesSearch(card, search));
  const upcomingCards = filteredCards
    .filter((card) => card.status === "Upcoming vote" || card.meetings?.status === "Upcoming")
    .slice(0, 4);
  const recentCards = filteredCards.slice(0, 4);
  return (
    <div>
      <section className="border-b border-black/10 bg-newsprint">
        <div className="section-shell grid gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
          <div className="flex flex-col justify-center">
            <p className="label-eyebrow text-civic">Foster City civic agenda tracker</p>
            <h1 className="page-title mt-4">
              Local decisions, translated.
            </h1>
            <p className="page-copy mt-5">
              Local government decisions affect your rent, streets, parks, safety, schools, and taxes.
              SimpleCity turns city meeting agendas into plain-English action cards so you know what is
              happening and how to speak up.
            </p>
            <div className="mt-7">
              <SearchAndFilters search={search} />
            </div>
          </div>

          <div className="quiet-card self-end overflow-hidden">
            <div className="border-b border-black/10 bg-civic px-5 py-4 text-white">
              <p className="text-sm font-bold uppercase text-white/80">Official-source workflow</p>
              <h2 className="mt-1 text-2xl font-bold">Agenda packet to action card</h2>
            </div>
            <div className="grid gap-0 divide-y divide-black/10 bg-white">
              {[
                "PrimeGov meeting rows are scraped from official Foster City pages.",
                "Agenda PDFs and HTML agendas are preserved with original source links.",
                "Summary cards show what changed, who is affected, and how to comment."
              ].map((item, index) => (
                <div key={item} className="flex gap-4 p-5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-harbor/10 text-sm font-black text-harbor">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-black/80">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell py-8">
        <AnnouncementBanner announcements={announcements} />
      </section>

      <section className="section-shell grid gap-8 py-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-10">
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="label-eyebrow text-civic">Upcoming decisions</p>
                <h2 className="section-title mt-1">What is coming up</h2>
              </div>
              <Link href="/meetings" className="action-ghost px-3 py-2">
                All meetings <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4">
              {(upcomingCards.length > 0 ? upcomingCards : recentCards).map((card) => (
                <SummaryCard key={card.id} card={card} />
              ))}
              {filteredCards.length === 0 ? (
                <div className="quiet-card p-8 text-center">
                  <h3 className="text-lg font-semibold text-ink">No cards yet</h3>
                  <p className="mt-2 text-sm leading-6 text-black/70">
                    Once the scraper and summarizer run, official Foster City agenda cards will appear here.
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <div className="mb-4">
              <p className="label-eyebrow text-harbor">Recently discussed</p>
              <h2 className="section-title mt-1">Latest agenda cards</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {recentCards.map((card) => (
                <SummaryCard key={card.id} card={card} />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="quiet-card p-5">
            <h2 className="text-xl font-bold text-ink">How to act</h2>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <MapPin aria-hidden className="mt-1 h-5 w-5 shrink-0 text-civic" />
                <p className="text-sm leading-6 text-black/80">
                  Check the meeting detail page for date, location, and official agenda links.
                </p>
              </div>
              <div className="flex gap-3">
                <MessageSquareText aria-hidden className="mt-1 h-5 w-5 shrink-0 text-harbor" />
                <p className="text-sm leading-6 text-black/80">
                  Use the comment window and submission link exactly as listed in the source document.
                </p>
              </div>
              <div className="flex gap-3">
                <Mail aria-hidden className="mt-1 h-5 w-5 shrink-0 text-clay" />
                <p className="text-sm leading-6 text-black/80">
                  If no contact is listed, the card will say so instead of guessing.
                </p>
              </div>
            </div>
          </div>
          <div className="quiet-card p-5">
            <h2 className="text-xl font-bold text-ink">Source transparency</h2>
            <p className="mt-2 text-sm leading-6 text-black/80">
              Every card links back to an official PrimeGov agenda, packet, or notice document.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
