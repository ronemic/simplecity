import Link from "next/link";
import { ArrowRight, CalendarDays, FileText, Mail, MapPin, MessageSquareText, ShieldCheck } from "lucide-react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { SearchAndFilters } from "@/components/SearchAndFilters";
import { SummaryCard } from "@/components/SummaryCard";
import { getActiveAnnouncements, getPublishedCards } from "@/lib/db/queries";
import type { SummaryCardRow } from "@/lib/types";
import { formatDisplayDate } from "@/lib/utils/date";

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

function isListed(value?: string | null) {
  return Boolean(value && !/not listed/i.test(value));
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
  const decisionCards = upcomingCards.length > 0 ? upcomingCards : recentCards;
  const featuredCard = decisionCards[0];

  return (
    <div>
      <section className="border-b border-black/10 bg-newsprint">
        <div className="section-shell grid gap-8 py-10 lg:grid-cols-[1.08fr_0.92fr] lg:py-14">
          <div className="flex flex-col justify-center">
            <p className="label-eyebrow text-civic">Foster City decision tracker</p>
            <h1 className="page-title mt-4">Know what City Hall is deciding next.</h1>
            <p className="page-copy mt-5">
              Scan upcoming votes, deadlines, and resident impact in plain English. Start with the
              decision, understand what changes, then choose how to speak up.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="#decisions" className="action-primary">
                Review upcoming decisions <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              <Link href="/meetings" className="action-secondary">
                Meeting calendar
              </Link>
            </div>
            <div className="mt-6">
              <SearchAndFilters search={search} />
            </div>
          </div>

          <div className="quiet-card self-end p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="label-eyebrow text-civic">Decision to watch</p>
              <span className="rounded-full border border-civic/20 bg-civic/5 px-3 py-1 text-xs font-bold text-civic">
                {decisionCards.length} upcoming
              </span>
            </div>
            {featuredCard ? (
              <div className="mt-5 space-y-4">
                <h2 className="text-2xl font-extrabold leading-tight text-ink">
                  {featuredCard.agenda_item || "Agenda item not listed"}
                </h2>
                <div className="grid gap-3 text-sm font-semibold text-black/75 sm:grid-cols-2">
                  <div className="rounded-lg border border-black/10 bg-paper/60 p-3">
                    <CalendarDays aria-hidden className="mb-2 h-5 w-5 text-civic" />
                    {formatDisplayDate(
                      featuredCard.meetings?.date_text,
                      featuredCard.meetings?.meeting_datetime
                    )}
                  </div>
                  <div className="rounded-lg border border-black/10 bg-paper/60 p-3">
                    <MessageSquareText aria-hidden className="mb-2 h-5 w-5 text-harbor" />
                    {isListed(featuredCard.comment_window_closes)
                      ? `Comments close ${featuredCard.comment_window_closes}`
                      : "Comment deadline not listed"}
                  </div>
                </div>
                <p className="line-clamp-4 text-sm leading-6 text-black/78">
                  {featuredCard.what_is_happening || "Summary not listed in the source document."}
                </p>
                <Link href="#decisions" className="action-ghost min-h-10 px-0 py-0 text-civic">
                  See the full decision card <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-black/20 bg-paper/60 p-5">
                <h2 className="text-xl font-bold text-ink">No published decision cards yet</h2>
                <p className="mt-2 text-sm leading-6 text-black/70">
                  Once the scraper and summarizer run, official Foster City agenda cards will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section-shell py-8">
        <AnnouncementBanner announcements={announcements} />
      </section>

      <section id="decisions" className="section-shell grid scroll-mt-24 gap-6 py-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-8">
          <section aria-labelledby="upcoming-decisions-heading">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="label-eyebrow text-civic">Upcoming decisions</p>
                <h2 id="upcoming-decisions-heading" className="section-title mt-1">
                  What needs attention now
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-black/70">
                  Prioritized by upcoming meetings, votes, and comment windows so residents can act before
                  decisions are made.
                </p>
              </div>
              <Link href="/meetings" className="action-ghost px-3 py-2">
                All meetings <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4">
              {decisionCards.map((card) => (
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

          <section aria-labelledby="latest-cards-heading">
            <div className="mb-4">
              <p className="label-eyebrow text-harbor">Recently discussed</p>
              <h2 id="latest-cards-heading" className="section-title mt-1">
                Latest agenda cards
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {recentCards.map((card) => (
                <SummaryCard key={card.id} card={card} />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:pt-24">
          <div className="quiet-card p-4">
            <h2 className="text-base font-extrabold text-ink">Take action</h2>
            <div className="mt-3 space-y-3">
              <div className="flex gap-3">
                <MessageSquareText aria-hidden className="mt-1 h-4 w-4 shrink-0 text-civic" />
                <p className="text-sm leading-6 text-black/75">
                  Start with <span className="font-semibold text-ink">Show more</span> to see impact and comment options.
                </p>
              </div>
              <div className="flex gap-3">
                <MapPin aria-hidden className="mt-1 h-4 w-4 shrink-0 text-harbor" />
                <p className="text-sm leading-6 text-black/75">
                  Open meeting details for date, location, agenda, and packet links.
                </p>
              </div>
              <div className="flex gap-3">
                <Mail aria-hidden className="mt-1 h-4 w-4 shrink-0 text-clay" />
                <p className="text-sm leading-6 text-black/75">
                  Use the listed comment window before the deadline shown on the card.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-6 border-t border-black/10 bg-white/70">
        <div className="section-shell grid gap-5 py-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="label-eyebrow text-black/55">Trust and sources</p>
            <h2 className="section-title mt-1">Official records stay one click away.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-black/70">
              SimpleCity keeps the decision card focused on what residents need first, while preserving
              source links for anyone who wants to audit the original agenda or packet.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: CalendarDays,
                title: "Dates first",
                body: "Meeting dates, vote timing, and comment windows are surfaced on every card."
              },
              {
                icon: ShieldCheck,
                title: "Official links",
                body: "Cards link back to PrimeGov agendas, packets, and notices when available."
              },
              {
                icon: FileText,
                title: "Plain English",
                body: "Summaries separate what is changing, why it matters, and how residents can act."
              }
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-black/10 bg-white p-4">
                <item.icon aria-hidden className="h-5 w-5 text-civic" />
                <h3 className="mt-3 text-sm font-extrabold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-black/70">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
