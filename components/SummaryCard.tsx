"use client";

import { CalendarDays, Clock, ExternalLink, FileText } from "lucide-react";
import { useState } from "react";
import { PendingLink } from "@/components/PendingLink";
import { CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
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

function formatCompactDate(dateText?: string | null, iso?: string | null) {
  const value = iso || dateText;
  if (!value) return "Date not listed";

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric"
    }).format(parsed);
  }

  const compactMatch = value.match(/[A-Za-z]{3,9}\.?\s+\d{1,2}/);
  return compactMatch?.[0].replace(".", "") || value;
}

const TOPIC_TONES: Partial<Record<CategoryName, string>> = {
  Housing: "bg-[#eef4ff] text-civic",
  Transportation: "bg-[#fff5df] text-[#bd6200]",
  "Public Safety": "bg-[#eefaf3] text-[#16823f]",
  "Parks & Environment": "bg-[#eff9f1] text-[#1f8f42]",
  "Budget & Taxes": "bg-[#fff8e8] text-[#e16800]",
  "Business & Development": "bg-[#f2f5ff] text-[#4b5f95]",
  "Schools & Youth": "bg-[#f7f1ff] text-[#6c4aa2]",
  "City Services": "bg-[#eef7f8] text-[#237277]"
};

function getPrimaryCategory(card: SummaryCardRow) {
  const category = (card.category_tags || []).find((item) => item in CATEGORY_DEFINITIONS);
  return category as CategoryName | undefined;
}

function statusSummary(card: SummaryCardRow) {
  if (isListed(card.comment_window_closes)) {
    return {
      label: `Closes ${formatCompactDate(card.comment_window_closes)}`,
      className: "border-[#f3b6b6] bg-[#fff1f1] text-[#a32121]",
      icon: Clock
    };
  }

  const status = card.status || card.meetings?.status || "Info only";

  if (status === "Upcoming vote" || status === "Upcoming") {
    return {
      label: "Vote upcoming",
      className: "border-[#f0c75e] bg-[#fff9e9] text-[#a54f00]",
      icon: null
    };
  }

  if (status === "Information only") {
    return {
      label: "Info only",
      className: "border-[#92dfaa] bg-[#effbf3] text-[#16743b]",
      icon: null
    };
  }

  return {
    label: status,
    className: "border-black/15 bg-black/[0.035] text-black/65",
    icon: null
  };
}

export function SummaryCard({ card }: { card: SummaryCardRow }) {
  const [open, setOpen] = useState(false);
  const meeting = card.meetings;
  const points = summaryPoints(card.what_is_happening);
  const meetingDate = formatDisplayDate(meeting?.date_text, meeting?.meeting_datetime);
  const compactMeetingDate = formatCompactDate(meeting?.date_text, meeting?.meeting_datetime);
  const affectedResidents = compactList(card.who_it_affects);
  const affectedTags = (card.who_it_affects || []).filter(Boolean).slice(0, 4);
  const primaryCategory = getPrimaryCategory(card);
  const categoryDefinition = primaryCategory ? CATEGORY_DEFINITIONS[primaryCategory] : null;
  const TopicIcon = categoryDefinition?.icon || FileText;
  const status = statusSummary(card);
  const StatusIcon = status.icon;
  const isInformationOnly = card.status === "Information only";
  const showCommentAction = !isInformationOnly && hasCommentAction(card);
  const buttonClass =
    "inline-flex min-h-12 items-center justify-center rounded-lg border border-black/25 bg-white px-5 py-2 text-base font-bold text-ink shadow-sm transition hover:border-black/40 hover:bg-black/[0.025] focus-visible:focus-ring whitespace-nowrap";

  return (
    <article
      className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm transition duration-200 hover:border-black/15 hover:shadow-[0_16px_36px_rgba(23,23,23,0.08)]"
    >
      <div className="grid gap-4 p-5 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <span
          aria-hidden
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-lg",
            primaryCategory ? TOPIC_TONES[primaryCategory] : "bg-black/[0.035] text-black/65"
          )}
        >
          <TopicIcon className="h-6 w-6" />
        </span>

        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-black/[0.58]">
            {meeting?.meeting_type || "Meeting type not listed"}
          </p>
          <h3 className="mt-1 line-clamp-2 text-xl font-bold leading-snug text-ink">
            {card.agenda_item || "Agenda item not listed"}
          </h3>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <span
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold",
                status.className
              )}
            >
              {StatusIcon ? <StatusIcon aria-hidden className="h-3.5 w-3.5" /> : null}
              {status.label}
            </span>
            {isListed(card.comment_window_closes) ? null : (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-black/[0.55]">
                <CalendarDays aria-hidden className="h-4 w-4" />
                {compactMeetingDate}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            {showCommentAction ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className={buttonClass}
              >
                Comment
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className={buttonClass}
              aria-expanded={open}
            >
              {open ? "Hide" : "Details"}
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="border-t border-black/10 px-5 py-5 sm:px-6">
          <div className="grid gap-6 text-sm leading-6 text-black/75 lg:grid-cols-[1fr_1fr_1.15fr]">
            <section>
              <p className="text-xs font-bold uppercase text-civic">What&apos;s happening</p>
              <ul className="mt-2 space-y-2">
                {points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-civic" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <p className="text-xs font-bold uppercase text-black/55">Why it matters</p>
              <p className="mt-2">{card.why_it_matters || "Not listed in the source document."}</p>
              <p className="mt-4 text-xs font-bold uppercase text-black/55">Who is affected</p>
              {affectedTags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {affectedTags.map((resident) => (
                    <span key={resident} className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-black/70">
                      {resident}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2">{affectedResidents}</p>
              )}
            </section>

            <section>
              <p className="text-xs font-bold uppercase text-clay">How to act</p>
              <div className="mt-2 grid gap-3">
                <p>
                  <span className="font-bold text-ink">Attend: </span>
                  {card.how_to_act_attend || "Not listed in the source document."}
                </p>
                <p>
                  <span className="font-bold text-ink">Email: </span>
                  {card.how_to_act_email || "Not listed in the source document."}
                </p>
                <p>
                  <span className="font-bold text-ink">Submit comment: </span>
                  {card.how_to_act_submit_comment || "Not listed in the source document."}
                </p>
              </div>
            </section>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4 text-sm font-semibold text-black/[0.68]">
            <span>{meetingDate}</span>
            {meeting?.id ? (
              <PendingLink
                href={`/meetings/${meeting.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-civic transition hover:bg-civic/5 focus-visible:focus-ring"
                pendingLabel="Opening meeting"
              >
                Meeting page
              </PendingLink>
            ) : null}
            {card.source_url ? (
              <a
                href={card.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-civic transition hover:bg-civic/5 focus-visible:focus-ring"
              >
                Source
                <ExternalLink aria-hidden className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
