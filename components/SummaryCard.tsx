"use client";

import { CalendarDays, ChevronDown, ExternalLink, FileText, Info, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { CategoryPill } from "@/components/CategoryPill";
import { StatusPill } from "@/components/StatusPill";
import { PendingLink } from "@/components/PendingLink";
import type { SummaryCardRow } from "@/lib/types";
import { formatDisplayDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

function summaryPoints(text?: string | null) {
  const fallback = "Not listed in the source document.";
  const content = text?.trim() || fallback;
  const matches = content.match(/[^.!?]+[.!?]?/g);
  return (matches || [content]).map((item) => item.trim()).filter(Boolean).slice(0, 3);
}

function compactList(items?: string[] | null) {
  if (!items || items.length === 0) return "Not listed";
  return items.slice(0, 3).join(", ");
}

function isListed(value?: string | null) {
  return Boolean(value && !/not listed/i.test(value));
}

function urgencyLabel(card: SummaryCardRow) {
  if (isListed(card.comment_window_closes)) return `Comment deadline: ${card.comment_window_closes}`;
  if (card.status === "Upcoming vote") return "Vote date shown in meeting details";
  return "Meeting date";
}

export function SummaryCard({ card }: { card: SummaryCardRow }) {
  const [open, setOpen] = useState(false);
  const meeting = card.meetings;
  const categories = card.category_tags || [];
  const points = summaryPoints(card.what_is_happening);
  const meetingDate = formatDisplayDate(meeting?.date_text, meeting?.meeting_datetime);
  const affectedResidents = compactList(card.who_it_affects);

  return (
    <article className="quiet-card overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(23,23,23,0.12)]">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
          <div className="inline-flex items-center gap-2 rounded-full border border-civic/20 bg-civic/5 px-3 py-1 text-xs font-bold text-civic">
            <CalendarDays aria-hidden className="h-3.5 w-3.5" />
            <span>{meetingDate}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase text-black/55">
            {meeting?.meeting_type || "Meeting type not listed"}
          </p>
          <h3 className="text-xl font-extrabold leading-tight text-ink sm:text-2xl">
            {card.agenda_item || "Agenda item not listed"}
          </h3>
          <p className="text-sm font-semibold text-civic">
            {urgencyLabel(card)}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <section className="rounded-lg border border-black/10 bg-paper/50 p-4">
            <p className="text-xs font-bold uppercase text-civic">What&apos;s happening</p>
            <ul className={cn("mt-2 space-y-2 text-sm leading-6 text-black/80", !open && "line-clamp-5")}>
              {points.map((point) => (
                <li key={point} className="flex gap-2">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-civic" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-3 text-sm leading-6 lg:block lg:space-y-3">
            <section>
              <p className="text-xs font-bold uppercase text-black/55">Why it matters</p>
              <p className={cn("mt-1 text-black/78", !open && "line-clamp-3")}>
                {card.why_it_matters || "Not listed in the source document."}
              </p>
            </section>
            <section>
              <p className="text-xs font-bold uppercase text-black/55">Who is affected</p>
              <p className="mt-1 font-medium text-black/78">{affectedResidents}</p>
            </section>
          </div>
        </div>

        <div className="space-y-3">
          {open ? (
            <div className="grid gap-3 border-t border-black/10 pt-4 md:grid-cols-2">
              <section className="md:col-span-2">
                <p className="text-xs font-bold uppercase text-clay">How to act</p>
                <div className="mt-2 grid gap-3 text-sm leading-6 text-black/80 md:grid-cols-3">
                  <p className="rounded-lg border border-black/10 bg-white p-3">
                    <span className="font-semibold text-ink">Attend:</span>{" "}
                    {card.how_to_act_attend || "Not listed in the source document."}
                  </p>
                  <p className="rounded-lg border border-black/10 bg-white p-3">
                    <span className="font-semibold text-ink">Email:</span>{" "}
                    {card.how_to_act_email || "Not listed in the source document."}
                  </p>
                  <p className="rounded-lg border border-black/10 bg-white p-3">
                    <span className="font-semibold text-ink">Submit comment:</span>{" "}
                    {card.how_to_act_submit_comment || "Not listed in the source document."}
                  </p>
                </div>
              </section>
              <section className="md:col-span-2">
                <p className="text-xs font-bold uppercase text-black/55">Comment window</p>
                <p className="mt-1 inline-flex flex-wrap items-center gap-2 rounded-lg bg-civic/5 px-3 py-2 text-sm font-semibold leading-6 text-civic">
                  <MessageSquareText aria-hidden className="h-4 w-4" />
                  Opens {card.comment_window_opens || "Not listed in the source document."} · Closes{" "}
                  {card.comment_window_closes || "Not listed in the source document."}
                </p>
              </section>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-black/10 pt-4">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="action-primary min-h-10 px-4 py-2"
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown aria-hidden className="h-4 w-4 rotate-180 transition" />
            ) : (
              <Info aria-hidden className="h-4 w-4" />
            )}
            {open ? "Show less" : "Show more"}
          </button>
          {meeting?.id ? (
            <PendingLink
              href={`/meetings/${meeting.id}`}
              className="action-secondary min-h-10 px-4 py-2"
              pendingLabel="Opening meeting"
            >
              <CalendarDays aria-hidden className="h-4 w-4" />
              Meeting details
            </PendingLink>
          ) : null}
          {card.source_url ? (
            <a
              href={card.source_url}
              target="_blank"
              rel="noreferrer"
              className="action-tertiary min-h-10 px-3 py-2"
            >
              <FileText aria-hidden className="h-4 w-4" />
              Source
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
