"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";
import { CategoryPill } from "@/components/CategoryPill";
import { StatusPill } from "@/components/StatusPill";
import { PendingLink } from "@/components/PendingLink";
import type { SummaryCardRow } from "@/lib/types";
import { formatDisplayDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

export function SummaryCard({ card }: { card: SummaryCardRow }) {
  const [open, setOpen] = useState(false);
  const meeting = card.meetings;
  const categories = card.category_tags || [];

  return (
    <article className="quiet-card overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(23,23,23,0.12)]">
      <div className="space-y-5 p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((category) => (
            <CategoryPill
              key={category}
              category={category}
              compact
              href={`/categories/${encodeURIComponent(category.toLowerCase().replace(/ & /g, "-").replace(/\s+/g, "-"))}`}
            />
          ))}
          <StatusPill status={card.status} />
        </div>

        <div className="space-y-2">
          <h3 className="text-2xl font-bold leading-tight text-ink">{card.agenda_item}</h3>
          <p className="text-sm font-medium text-black/70">
            {formatDisplayDate(meeting?.date_text, meeting?.meeting_datetime)} ·{" "}
            {meeting?.meeting_type || "Meeting type not listed"}
          </p>
        </div>

        <div className="space-y-3">
          <section>
            <p className="text-xs font-bold uppercase text-civic">What&apos;s happening</p>
            <p className={cn("mt-1 text-base leading-7 text-black/80", !open && "line-clamp-3")}>
              {card.what_is_happening || "Not listed in the source document."}
            </p>
          </section>

          {open ? (
            <div className="grid gap-3 border-t border-black/10 pt-4 md:grid-cols-2">
              <section>
                <p className="text-xs font-bold uppercase text-harbor">Why it matters</p>
                <p className="mt-1 text-base leading-7 text-black/80">
                  {card.why_it_matters || "Not listed in the source document."}
                </p>
              </section>
              <section>
                <p className="text-xs font-bold uppercase text-moss">Who it affects</p>
                <p className="mt-1 text-base leading-7 text-black/80">
                  {(card.who_it_affects || []).length > 0
                    ? (card.who_it_affects || []).join(", ")
                    : "Not listed in the source document."}
                </p>
              </section>
              <section className="md:col-span-2">
                <p className="text-xs font-bold uppercase text-clay">How to act</p>
                <div className="mt-2 grid gap-3 text-sm leading-6 text-black/80 md:grid-cols-3">
                  <p>
                    <span className="font-semibold text-ink">Attend:</span>{" "}
                    {card.how_to_act_attend || "Not listed in the source document."}
                  </p>
                  <p>
                    <span className="font-semibold text-ink">Email:</span>{" "}
                    {card.how_to_act_email || "Not listed in the source document."}
                  </p>
                  <p>
                    <span className="font-semibold text-ink">Submit comment:</span>{" "}
                    {card.how_to_act_submit_comment || "Not listed in the source document."}
                  </p>
                </div>
              </section>
              <section className="md:col-span-2">
                <p className="text-xs font-bold uppercase text-black/70">Comment window</p>
                <p className="mt-1 text-sm leading-6 text-black/80">
                  Opens {card.comment_window_opens || "Not listed in the source document."} · Closes{" "}
                  {card.comment_window_closes || "Not listed in the source document."}
                </p>
              </section>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-black/10 pt-5">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="action-secondary px-4"
            aria-expanded={open}
          >
            <ChevronDown aria-hidden className={cn("h-4 w-4 transition", open && "rotate-180")} />
            {open ? "Show less" : "Read more"}
          </button>
          {meeting?.id ? (
            <PendingLink
              href={`/meetings/${meeting.id}`}
              className="action-secondary px-4"
              pendingLabel="Opening meeting"
            >
              Meeting details
            </PendingLink>
          ) : null}
          {card.source_url ? (
            <a
              href={card.source_url}
              target="_blank"
              rel="noreferrer"
              className="action-primary px-4"
            >
              <ExternalLink aria-hidden className="h-4 w-4" />
              View source
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
