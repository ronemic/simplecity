"use client";

import { CalendarDays, ChevronDown, Clock, ExternalLink, FileText, MessageSquare } from "lucide-react";
import { useState } from "react";
import { PendingLink } from "@/components/PendingLink";
import { CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import type { SummaryCardRow } from "@/lib/types";
import { getCommentDeadlineInfo, hasCommentOptionInfo, type CommentDeadlineInfo } from "@/lib/utils/commentDeadline";
import { formatCompactDisplayDate, formatDisplayDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

function summaryPoints(text?: string | null) {
  const fallback = "Not listed in the source document.";
  const content = (text?.trim() || fallback).replace(/\s+/g, " ");
  return content
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"$“])/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function compactList(items?: string[] | null) {
  if (!items || items.length === 0) return "Not listed";
  return items.slice(0, 3).join(", ");
}

function getCardCommentDeadlineInfo(card: SummaryCardRow) {
  return getCommentDeadlineInfo({
    closes: card.comment_window_closes,
    actionTexts: [
      card.how_to_act_submit_comment,
      card.how_to_act_email
    ]
  });
}

function hasCardCommentOptionInfo(card: SummaryCardRow) {
  return hasCommentOptionInfo({
    closes: card.comment_window_closes,
    actionTexts: [
      card.how_to_act_submit_comment,
      card.how_to_act_email
    ]
  });
}

function getPrimaryCategory(card: SummaryCardRow) {
  const category = (card.category_tags || []).find((item) => item in CATEGORY_DEFINITIONS);
  return category as CategoryName | undefined;
}

function statusSummary(card: SummaryCardRow, commentDeadline: CommentDeadlineInfo | null, hasCommentOption: boolean) {
  if (commentDeadline) {
    return {
      label: `Comment deadline ${formatCompactDisplayDate(commentDeadline.value)}`,
      className: "border-[#e7ba6a] bg-[#fff7e8] text-[#7a4808]",
      icon: Clock
    };
  }

  if (hasCommentOption) {
    return {
      label: "Comment option listed",
      className: "border-[#9fc6b2] bg-[#f1fbf4] text-[#24613c]",
      icon: MessageSquare
    };
  }

  const status = card.status || card.meetings?.status || "Info only";
  const compactMeetingDate = formatCompactDisplayDate(
    card.meetings?.date_text,
    card.meetings?.meeting_datetime
  );

  if (status === "Cancelled" || status === "Canceled" || card.meetings?.status === "Cancelled") {
    return {
      label: "Meeting canceled",
      className: "border-[#e5b6b3] bg-[#fff1f0] text-[#9f2a20]",
      icon: null
    };
  }

  if (status === "Upcoming vote" || status === "Upcoming") {
    return {
      label:
        compactMeetingDate === "Date not listed"
          ? "Vote upcoming"
          : status === "Upcoming vote"
            ? `Vote scheduled ${compactMeetingDate}`
            : `Meeting ${compactMeetingDate}`,
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
    className: "border-black/15 bg-black/[0.035] text-black/[0.65]",
    icon: null
  };
}

function jurisdictionLabel(card: SummaryCardRow) {
  if (card.jurisdiction_slug === "san-mateo-city" || card.meetings?.jurisdiction_slug === "san-mateo-city") {
    return "San Mateo";
  }

  if (
    card.jurisdiction_slug === "santa-clara-county" ||
    card.meetings?.jurisdiction_slug === "santa-clara-county"
  ) {
    return "Santa Clara County";
  }

  return (
    card.jurisdiction_name ||
    card.meetings?.jurisdiction_name ||
    "Foster City"
  );
}

function jurisdictionSlug(card: SummaryCardRow) {
  const slug = card.jurisdiction_slug || card.meetings?.jurisdiction_slug || "foster-city";
  return slug === "san-mateo-city" ? "san-mateo" : slug;
}

function confidenceLabel(card: SummaryCardRow) {
  const confidence = String(card.confidence || "").trim().toLowerCase();
  if (!["high", "medium", "low"].includes(confidence)) return null;
  return `Summary confidence: ${confidence}`;
}

export function SummaryCard({ card }: { card: SummaryCardRow }) {
  const [open, setOpen] = useState(false);
  const meeting = card.meetings;
  const points = summaryPoints(card.what_is_happening);
  const meetingDate = formatDisplayDate(meeting?.date_text, meeting?.meeting_datetime, meeting?.time_text);
  const compactMeetingDate = formatCompactDisplayDate(meeting?.date_text, meeting?.meeting_datetime);
  const affectedResidents = compactList(card.who_it_affects);
  const affectedTags = (card.who_it_affects || []).filter(Boolean).slice(0, 4);
  const categoryTags = (card.category_tags || []).filter(Boolean).slice(0, 3);
  const topicLabel = categoryTags[0] || "Topic not listed";
  const primaryCategory = getPrimaryCategory(card);
  const categoryDefinition = primaryCategory ? CATEGORY_DEFINITIONS[primaryCategory] : null;
  const TopicIcon = categoryDefinition?.icon || FileText;
  const commentDeadline = getCardCommentDeadlineInfo(card);
  const hasCommentOption = hasCardCommentOptionInfo(card);
  const status = statusSummary(card, commentDeadline, hasCommentOption);
  const summaryConfidence = confidenceLabel(card);
  const StatusIcon = status.icon;
  const cardJurisdictionLabel = jurisdictionLabel(card);
  const cardJurisdictionSlug = jurisdictionSlug(card);
  const primaryButtonClass =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#12365f] px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-[#0d2949] focus-visible:focus-ring active:translate-y-px whitespace-nowrap";
  const noCommentLabel = "No comment option listed";

  return (
    <article
      className="overflow-hidden rounded-[10px] border border-black/10 bg-white shadow-[0_1px_2px_rgba(23,23,23,0.04)] transition duration-200 hover:border-civic/25"
    >
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold leading-5 text-black/[0.58]">
            <span>{meeting?.meeting_type || "Meeting type not listed"}</span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-black/25" />
            <span>{cardJurisdictionLabel}</span>
          </div>
          <h3 className="mt-1 line-clamp-2 text-xl font-black leading-snug text-ink">
            {card.agenda_item || "Agenda item not listed"}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-black/[0.62]">
            <span
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-black",
                status.className
              )}
            >
              {StatusIcon ? <StatusIcon aria-hidden className="h-3.5 w-3.5" /> : null}
              {status.label}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays aria-hidden className="h-4 w-4 text-[#42677f]" />
              {compactMeetingDate}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="flex h-5 w-5 items-center justify-center rounded bg-[#eef3f6] text-[#12365f]"
              >
                <TopicIcon className="h-3.5 w-3.5" />
              </span>
              {topicLabel}
            </span>
            {!hasCommentOption ? (
              <span className="inline-flex items-center gap-1.5 text-black/[0.5]">
                <MessageSquare aria-hidden className="h-4 w-4" />
                {noCommentLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={primaryButtonClass}
            aria-expanded={open}
          >
            {open ? "Hide summary" : "Read summary"}
            <ChevronDown
              aria-hidden
              className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-black/10 bg-[#f8fafb] px-5 py-5 sm:px-6">
          <div className="grid gap-6 text-sm leading-6 text-black/75 lg:grid-cols-[1fr_1fr_1.15fr]">
            <section>
              <p className="text-xs font-black uppercase text-civic">What&apos;s happening</p>
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
              <p className="text-xs font-black uppercase text-black/[0.55]">Why it matters</p>
              <p className="mt-2">{card.why_it_matters || "Not listed in the source document."}</p>
              <p className="mt-4 text-xs font-black uppercase text-black/[0.55]">Who is affected</p>
              {affectedTags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {affectedTags.map((resident) => (
                    <span key={resident} className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-black/70">
                      {resident}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2">{affectedResidents}</p>
              )}
            </section>

            <section>
              <p className="text-xs font-black uppercase text-[#8e452e]">How to act</p>
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
                href={`/meetings/${meeting.id}?jurisdiction=${cardJurisdictionSlug}`}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-civic transition hover:bg-civic/5 focus-visible:focus-ring"
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
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-civic transition hover:bg-civic/5 focus-visible:focus-ring"
              >
                Source
                <ExternalLink aria-hidden className="h-4 w-4" />
              </a>
            ) : null}
            {summaryConfidence ? (
              <span className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs font-bold uppercase tracking-normal text-black/50">
                {summaryConfidence}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
