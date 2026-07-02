"use client";

import { CalendarDays, ChevronDown, Clock, ExternalLink, FileText, MessageSquare } from "lucide-react";
import { useState } from "react";
import { PendingLink } from "@/components/PendingLink";
import { HighlightedText } from "@/components/HighlightedText";
import { CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import type { SummaryCardRow } from "@/lib/types";
import { getJurisdictionDisplayLabel } from "@/lib/config/jurisdictions";
import { getCommentDeadlineInfo, hasCommentOptionInfo, type CommentDeadlineInfo } from "@/lib/utils/commentDeadline";
import { publicAgendaTitle } from "@/lib/utils/civicPriority";
import { displayMeetingType } from "@/lib/utils/meetingDisplay";
import { formatCompactDisplayDate, formatDisplayDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { getHighlightExcerpt } from "@/lib/utils/highlightText";
import { categoryLabel, type Locale, statusLabel, t } from "@/lib/i18n";

function summaryPoints(text: string | null | undefined, locale: Locale) {
  const fallback = t(locale, "notListedInSource");
  const content = (text?.trim() || fallback).replace(/\s+/g, " ");
  const sentenceSafeContent = content
    .replace(/\b([A-Z])\.(?=\s+[A-Z][a-z])/g, "$1__SIMPLECITY_DOT__")
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|No|Inc|Co|Ltd|LLC)\.(?=\s+)/gi, "$1__SIMPLECITY_DOT__");

  return sentenceSafeContent
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"$“])/)
    .map((item) => item.replace(/__SIMPLECITY_DOT__/g, ".").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function compactList(items: string[] | null | undefined, locale: Locale) {
  if (!items || items.length === 0) return t(locale, "notListed");
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

function statusSummary(
  card: SummaryCardRow,
  commentDeadline: CommentDeadlineInfo | null,
  hasCommentOption: boolean,
  locale: Locale
) {
  if (commentDeadline) {
    return {
      label: `${t(locale, "commentDeadline")} ${formatCompactDisplayDate(commentDeadline.value)}`,
      className: "border-[#e7ba6a] bg-[#fff7e8] text-[#7a4808]",
      icon: Clock
    };
  }

  if (hasCommentOption) {
    return {
      label: t(locale, "commentOptionListed"),
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
      label: t(locale, "meetingCanceled"),
      className: "border-[#e5b6b3] bg-[#fff1f0] text-[#9f2a20]",
      icon: null
    };
  }

  if (status === "Upcoming vote" || status === "Upcoming") {
    return {
      label:
        compactMeetingDate === "Date not listed"
          ? t(locale, "voteUpcoming")
          : status === "Upcoming vote"
            ? locale === "es"
              ? `Votación programada ${compactMeetingDate}`
              : `Vote scheduled ${compactMeetingDate}`
            : locale === "es"
              ? `Reunión ${compactMeetingDate}`
              : `Meeting ${compactMeetingDate}`,
      className: "border-[#f0c75e] bg-[#fff9e9] text-[#a54f00]",
      icon: null
    };
  }

  if (status === "Information only") {
    return {
      label: statusLabel(locale, "Info only"),
      className: "border-[#92dfaa] bg-[#effbf3] text-[#16743b]",
      icon: null
    };
  }

  return {
    label: statusLabel(locale, status),
    className: "border-black/15 bg-black/[0.035] text-black/[0.65]",
    icon: null
  };
}

function jurisdictionLabel(card: SummaryCardRow) {
  return getJurisdictionDisplayLabel(
    card.jurisdiction_slug || card.meetings?.jurisdiction_slug || card.jurisdiction_name
  );
}

function meetingHref(card: SummaryCardRow) {
  const meeting = card.meetings;
  if (!meeting?.id) return null;

  const jurisdiction =
    meeting.jurisdiction_slug === "san-mateo-city"
      ? "san-mateo"
      : meeting.jurisdiction_slug || card.jurisdiction_slug;

  return `/meetings/${meeting.id}${jurisdiction ? `?jurisdiction=${jurisdiction}` : ""}`;
}

function confidenceLabel(card: SummaryCardRow, locale: Locale) {
  const confidence = String(card.confidence || "").trim().toLowerCase();
  if (!["high", "medium", "low"].includes(confidence)) return null;
  const localizedConfidence =
    locale === "es"
      ? confidence === "high"
        ? "alta"
        : confidence === "medium"
          ? "media"
          : "baja"
      : confidence;
  return `${t(locale, "summaryConfidence")}: ${localizedConfidence}`;
}

export function SummaryCard({
  card,
  highlight,
  locale = "en"
}: {
  card: SummaryCardRow;
  highlight?: string;
  locale?: Locale;
}) {
  const [open, setOpen] = useState(false);
  const meeting = card.meetings;
  const agendaTitle = publicAgendaTitle(card);
  const points = summaryPoints(card.what_is_happening, locale);
  const defaultTitlePreview = points[0] === t(locale, "notListedInSource") ? null : points[0];
  const meetingDate = formatDisplayDate(meeting?.date_text, meeting?.meeting_datetime, meeting?.time_text);
  const compactMeetingDate = formatCompactDisplayDate(meeting?.date_text, meeting?.meeting_datetime);
  const affectedResidents = compactList(card.who_it_affects, locale);
  const affectedTags = (card.who_it_affects || []).filter(Boolean).slice(0, 4);
  const categoryTags = (card.category_tags || []).filter(Boolean).slice(0, 3);
  const normalizedHighlight = highlight?.trim().toLowerCase() || "";
  const topicLabel = categoryTags[0] ? categoryLabel(locale, categoryTags[0]) : t(locale, "topicNotListed");
  const primaryCategory = getPrimaryCategory(card);
  const categoryDefinition = primaryCategory ? CATEGORY_DEFINITIONS[primaryCategory] : null;
  const titleContainsHighlight = normalizedHighlight
    ? agendaTitle.toLowerCase().includes(normalizedHighlight)
    : false;
  const matchingPreview = !titleContainsHighlight && highlight
    ? [card.what_is_happening, card.why_it_matters, meeting?.title]
      .map((text) => getHighlightExcerpt(text, highlight))
      .find(Boolean)
    : null;
  const titlePreview = matchingPreview || defaultTitlePreview;
  const TopicIcon = categoryDefinition?.icon || FileText;
  const commentDeadline = getCardCommentDeadlineInfo(card);
  const hasCommentOption = hasCardCommentOptionInfo(card);
  const status = statusSummary(card, commentDeadline, hasCommentOption, locale);
  const summaryConfidence = confidenceLabel(card, locale);
  const StatusIcon = status.icon;
  const cardJurisdictionLabel = jurisdictionLabel(card);
  const meetingPageHref = meetingHref(card);
  const primaryButtonClass = "action-primary-sm font-black";
  const noCommentLabel = t(locale, "noCommentOptionListed");

  return (
    <article className="quiet-card overflow-hidden">
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold leading-5 text-black/[0.58]">
            <span>
              <HighlightedText
                text={meeting ? displayMeetingType(meeting, t(locale, "meetingTypeNotListed"), locale) : t(locale, "meetingTypeNotListed")}
                query={highlight}
              />
            </span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-black/25" />
            <span><HighlightedText text={cardJurisdictionLabel} query={highlight} /></span>
          </div>
          <h3 className="mt-1 line-clamp-3 text-xl font-black leading-snug text-ink sm:line-clamp-2">
            <HighlightedText text={agendaTitle} query={highlight} />
          </h3>
          {titlePreview ? (
            <p className="mt-2 line-clamp-3 max-w-4xl text-sm font-semibold leading-6 text-black/[0.62] sm:line-clamp-2">
              <HighlightedText text={titlePreview} query={highlight} />
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-black/[0.62]">
            <span
              className={cn(
                "status-chip",
                status.className
              )}
            >
              {StatusIcon ? <StatusIcon aria-hidden className="h-3.5 w-3.5" /> : null}
              <HighlightedText text={status.label} query={highlight} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays aria-hidden className="h-4 w-4 text-[#42677f]" />
              {compactMeetingDate}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="icon-badge"
              >
                <TopicIcon className="h-3.5 w-3.5" />
              </span>
              <HighlightedText text={topicLabel} query={highlight} />
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
            {open ? t(locale, "hideSummary") : t(locale, "readSummary")}
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
              <p className="text-xs font-black uppercase text-civic">{t(locale, "whatIsHappening")}</p>
              <ul className="mt-2 space-y-2">
                {points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-civic" />
                    <span><HighlightedText text={point} query={highlight} /></span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <p className="text-xs font-black uppercase text-black/[0.55]">{t(locale, "whyItMatters")}</p>
              <p className="mt-2">
                <HighlightedText
                  text={card.why_it_matters || t(locale, "notListedInSource")}
                  query={highlight}
                />
              </p>
              <p className="mt-4 text-xs font-black uppercase text-black/[0.55]">{t(locale, "whoIsAffected")}</p>
              {affectedTags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {affectedTags.map((resident) => (
                    <span key={resident} className="meta-chip">
                      <HighlightedText text={resident} query={highlight} />
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2"><HighlightedText text={affectedResidents} query={highlight} /></p>
              )}
            </section>

            <section>
              <p className="text-xs font-black uppercase text-[#8e452e]">{t(locale, "howToAct")}</p>
              <div className="mt-2 grid gap-3">
                <p>
                  <span className="font-bold text-ink">{locale === "es" ? "Asistir: " : "Attend: "}</span>
                  <HighlightedText
                    text={card.how_to_act_attend || t(locale, "notListedInSource")}
                    query={highlight}
                  />
                </p>
                <p>
                  <span className="font-bold text-ink">Email: </span>
                  <HighlightedText
                    text={card.how_to_act_email || t(locale, "notListedInSource")}
                    query={highlight}
                  />
                </p>
                <p>
                  <span className="font-bold text-ink">{t(locale, "submitComment")}: </span>
                  <HighlightedText
                    text={card.how_to_act_submit_comment || t(locale, "notListedInSource")}
                    query={highlight}
                  />
                </p>
              </div>
            </section>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4 text-sm font-semibold text-black/[0.68]">
            <span>{meetingDate}</span>
            {meetingPageHref ? (
              <PendingLink
                href={meetingPageHref}
                className="action-link"
                pendingLabel={t(locale, "openingMeeting")}
              >
                {t(locale, "meetingPage")}
              </PendingLink>
            ) : null}
            {card.source_url ? (
              <a
                href={card.source_url}
                target="_blank"
                rel="noreferrer"
                className="action-link"
              >
                {t(locale, "source")}
                <ExternalLink aria-hidden className="h-4 w-4" />
              </a>
            ) : null}
            {summaryConfidence ? (
              <span className="meta-chip uppercase tracking-normal text-black/50">
                {summaryConfidence}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
