"use client";

import { CalendarDays, ChevronDown, Clock, ExternalLink, Info, MessageSquareText } from "lucide-react";
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

function hasCommentAction(card: SummaryCardRow) {
  return ["Upcoming vote", "Under discussion", "Upcoming"].includes(card.status || "") || isListed(card.comment_window_closes);
}

export function SummaryCard({ card }: { card: SummaryCardRow }) {
  const [open, setOpen] = useState(false);
  const meeting = card.meetings;
  const categories = card.category_tags || [];
  const points = summaryPoints(card.what_is_happening);
  const meetingDate = formatDisplayDate(meeting?.date_text, meeting?.meeting_datetime);
  const affectedResidents = compactList(card.who_it_affects);
  const affectedTags = (card.who_it_affects || []).filter(Boolean).slice(0, 4);
  const hasDeadline = isListed(card.comment_window_closes);
  const isInformationOnly = card.status === "Information only";
  const compactInformationCard = isInformationOnly && !hasDeadline;
  const showDetails = !compactInformationCard || open;
  const showCommentAction = !isInformationOnly && hasCommentAction(card);

  return (
    <article
      className={cn(
        "quiet-card overflow-hidden transition duration-200",
        compactInformationCard
          ? "border-black/[0.07] opacity-[0.78] hover:opacity-100"
          : "hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(23,23,23,0.12)]"
      )}
    >
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
          {hasDeadline ? (
            <div className="deadline-badge inline-flex items-center gap-2 rounded-[20px] bg-[#fcebeb] px-3 py-1 text-xs font-medium text-[#a32d2d]">
              <Clock aria-hidden className="h-3.5 w-3.5" />
              <span>Comments close {card.comment_window_closes}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-black/[0.04] px-3 py-1 text-xs font-medium text-black/55">
              <CalendarDays aria-hidden className="h-3.5 w-3.5" />
              <span>{meetingDate}</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="committee-eyebrow">
            {meeting?.meeting_type || "Meeting type not listed"}
          </p>
          <h3 className={cn("font-bold leading-tight text-ink", compactInformationCard ? "text-lg sm:text-xl" : "text-xl sm:text-2xl")}>
            {card.agenda_item || "Agenda item not listed"}
          </h3>
        </div>

        {compactInformationCard && !open ? (
          <p className="line-clamp-2 text-sm leading-6 text-black/65">
            {card.what_is_happening || "Summary not listed in the source document."}
          </p>
        ) : null}

        {showDetails ? (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-lg bg-paper/70 p-[14px]">
              <p className="text-xs font-medium uppercase text-civic">What&apos;s happening</p>
              <ul className={cn("mt-2 space-y-2 text-sm leading-6 text-black/80", !open && "line-clamp-5")}>
                {points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-civic" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg bg-paper/70 p-[14px] text-sm leading-6">
              <p className="text-xs font-medium uppercase text-black/55">Why it matters</p>
              <p className={cn("mt-1 text-black/78", !open && "line-clamp-3")}>
                {card.why_it_matters || "Not listed in the source document."}
              </p>
              <p className="mt-4 text-xs font-medium uppercase text-black/55">Who is affected</p>
              {affectedTags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {affectedTags.map((resident) => (
                    <span key={resident} className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-black/70">
                      {resident}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-black/78">{affectedResidents}</p>
              )}
            </section>
          </div>
        ) : null}

        <div className="space-y-3">
          {open ? (
            <div className="grid gap-3 border-t border-black/10 pt-4 md:grid-cols-2">
              <section className="md:col-span-2">
                <p className="text-xs font-medium uppercase text-clay">How to act</p>
                <div className="mt-2 grid gap-3 text-sm leading-6 text-black/80 md:grid-cols-3">
                  <div className="rounded-lg border border-black/10 bg-white p-3">
                    <p className="text-xs font-medium uppercase text-black/55">Attend</p>
                    <p className="mt-1 text-black/78">{card.how_to_act_attend || "Not listed in the source document."}</p>
                  </div>
                  <div className="rounded-lg border border-black/10 bg-white p-3">
                    <p className="text-xs font-medium uppercase text-black/55">Email</p>
                    <p className="mt-1 text-black/78">{card.how_to_act_email || "Not listed in the source document."}</p>
                  </div>
                  <div className="rounded-lg border border-black/10 bg-white p-3">
                    <p className="text-xs font-medium uppercase text-black/55">Submit comment</p>
                    <p className="mt-1 text-black/78">{card.how_to_act_submit_comment || "Not listed in the source document."}</p>
                  </div>
                </div>
              </section>
              <section className="md:col-span-2">
                <p className="text-xs font-medium uppercase text-black/55">Comment window</p>
                <p className="mt-1 inline-flex flex-wrap items-center gap-2 rounded-lg bg-civic/5 px-3 py-2 text-sm leading-6 text-civic">
                  <MessageSquareText aria-hidden className="h-4 w-4" />
                  Opens {card.comment_window_opens || "Not listed in the source document."} · Closes{" "}
                  {card.comment_window_closes || "Not listed in the source document."}
                </p>
              </section>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-black/10 pt-4">
          {showCommentAction ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="action-primary min-h-10 px-4 py-2"
            >
              <MessageSquareText aria-hidden className="h-4 w-4" />
              Submit a comment
            </button>
          ) : null}
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
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border-0 px-2 py-2 text-sm font-medium text-black/55 transition hover:bg-black/[0.035] hover:text-ink"
            >
              Source
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="ml-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-black/60 transition hover:bg-black/[0.04] hover:text-ink"
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown aria-hidden className="h-4 w-4 rotate-180 transition" />
            ) : (
              <Info aria-hidden className="h-4 w-4" />
            )}
            {open ? "Show less" : "Details"}
          </button>
        </div>
      </div>
    </article>
  );
}
