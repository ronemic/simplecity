"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";
import { CardShareActions } from "@/components/CardShareActions";
import { DecisionOutcomePanel } from "@/components/DecisionOutcomePanel";
import { PendingLink } from "@/components/PendingLink";
import { HighlightedText } from "@/components/HighlightedText";
import type { DecisionOutcome, SummaryCardRow } from "@/lib/types";
import { getJurisdictionDisplayLabel } from "@/lib/config/jurisdictions";
import { getCommentDeadlineInfo, hasCommentOptionInfo, type CommentDeadlineInfo } from "@/lib/utils/commentDeadline";
import { publicAgendaTitle } from "@/lib/utils/civicPriority";
import { officialSourceFallbackReason } from "@/lib/utils/summaryFallback";
import { displayMeetingType } from "@/lib/utils/meetingDisplay";
import {
  formatCompactDisplayDate,
  formatDisplayDate,
  formatPacificTimestamp,
  isUpcomingMeetingDate,
  meetingDateParts
} from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { categoryLabel, type Locale, statusLabel, t } from "@/lib/i18n";
import { cardPreviewText, cardSummaryPoints } from "@/lib/utils/cardShare";
import { isAwaitingDecisionResult } from "@/lib/utils/decisionResultFilter";
import { SantaBarbaraInterestButton } from "@/components/SantaBarbaraInterestButton";
import { latestIsoTimestamp, SANTA_BARBARA_INTEREST_JURISDICTION } from "@/lib/interests/santaBarbara";

function compactList(items: string[] | null | undefined, locale: Locale) {
  if (!items || items.length === 0) return t(locale, "notListed");
  return items.slice(0, 3).join(", ");
}

export function officialSourceFallbackInfo(
  card: Pick<SummaryCardRow, "why_it_matters">,
  locale: Locale
) {
  const reason = officialSourceFallbackReason(card.why_it_matters);
  if (!reason) return null;

  if (locale === "es") {
    if (reason === "validation_failed") {
      return {
        reason,
        label: "No se pudo verificar el resumen"
      };
    }
    if (reason === "generation_failed") {
      return {
        reason,
        label: "No se generó el resumen"
      };
    }
    if (reason === "summary_omitted") {
      return {
        reason,
        label: "Punto omitido del resumen"
      };
    }
    return {
      reason,
      label: "Resumen no disponible"
    };
  }

  if (reason === "validation_failed") {
    return {
      reason,
      label: "Summary couldn’t be verified"
    };
  }
  if (reason === "generation_failed") {
    return {
      reason,
      label: "Summary wasn’t generated"
    };
  }
  if (reason === "summary_omitted") {
    return {
      reason,
      label: "Item omitted from summary"
    };
  }
  return {
    reason,
    label: "Summary unavailable"
  };
}

export function isOfficialSourceFallbackCard(card: Pick<SummaryCardRow, "why_it_matters">) {
  return Boolean(officialSourceFallbackInfo(card, "en"));
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

export function statusSummary(
  card: SummaryCardRow,
  locale: Locale,
  outcome: DecisionOutcome | null = card.outcome || null
) {
  const status = card.status || card.meetings?.status || "Info only";
  const compactMeetingDate = formatCompactDisplayDate(
    card.meetings?.date_text,
    card.meetings?.meeting_datetime
  );

  if (status === "Cancelled" || status === "Canceled" || card.meetings?.status === "Cancelled") {
    return {
      label: t(locale, "meetingCanceled"),
      className: "state--alert",
      icon: null
    };
  }

  if (isAwaitingDecisionResult(card, outcome)) {
    return {
      label: locale === "es" ? "Esperando resultado oficial" : "Awaiting official result",
      className: "state--upcoming",
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
      className: "state--upcoming",
      icon: null
    };
  }

  if (status === "Information only") {
    return {
      label: statusLabel(locale, "Info only"),
      className: "state--decided",
      icon: null
    };
  }

  if (status === "Routine approval") {
    return {
      label: statusLabel(locale, status),
      className: "state--decided",
      icon: null
    };
  }

  return {
    label: statusLabel(locale, status),
    className: "state--decided",
    icon: null
  };
}

/**
 * Ochre marks the one thing a reader can still do something about: a meeting
 * that has not happened yet and has a way to comment. Once the meeting is past,
 * the same comment path is history, so it drops to neutral.
 */
export function commentSummary(
  commentDeadline: CommentDeadlineInfo | null,
  hasCommentOption: boolean,
  locale: Locale,
  isUpcoming = true
) {
  if (!hasCommentOption && !commentDeadline) return null;

  if (!isUpcoming) {
    return {
      label: locale === "es" ? "El plazo de comentarios ya pasó" : "Comment period has passed",
      className: "state--decided",
      icon: null
    };
  }

  if (commentDeadline) {
    return {
      label: `${t(locale, "commentDeadline")} ${formatCompactDisplayDate(commentDeadline.value)}`,
      className: "state--open",
      icon: null
    };
  }

  return {
    label: locale === "es" ? "Abierto a comentarios" : "Open for comment",
    className: "state--open",
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
  locale = "en",
  presentation = "list",
  outcome = card.outcome,
  defaultOutcomeExpanded = false
}: {
  card: SummaryCardRow;
  highlight?: string;
  locale?: Locale;
  presentation?: "list" | "share";
  outcome?: DecisionOutcome | null;
  defaultOutcomeExpanded?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(outcome));
  const isSharePresentation = presentation === "share";
  const showDetails = open || isSharePresentation;
  const TitleTag = isSharePresentation ? "h1" : "h3";
  const meeting = card.meetings;
  const agendaTitle = publicAgendaTitle(card);
  const points = cardSummaryPoints(card, locale);
  const fallbackInfo = officialSourceFallbackInfo(card, locale);
  const officialSourceFallback = Boolean(fallbackInfo);
  const titlePreview = cardPreviewText(card, locale, highlight);
  const meetingDate = formatDisplayDate(meeting?.date_text, meeting?.meeting_datetime, meeting?.time_text);
  const compactMeetingDate = formatCompactDisplayDate(meeting?.date_text, meeting?.meeting_datetime);
  const affectedResidents = compactList(card.who_it_affects, locale);
  const affectedTags = (card.who_it_affects || []).filter(Boolean).slice(0, 4);
  const categoryTags = (card.category_tags || []).filter(Boolean).slice(0, 3);
  const topicLabel = categoryTags[0] ? categoryLabel(locale, categoryTags[0]) : t(locale, "topicNotListed");
  const commentDeadline = getCardCommentDeadlineInfo(card);
  const hasCommentOption = hasCardCommentOptionInfo(card);
  const status = statusSummary(card, locale, outcome);
  const isUpcoming = isUpcomingMeetingDate(
    meeting?.date_text,
    meeting?.meeting_datetime,
    meeting?.time_text
  );
  const comment = officialSourceFallback
    ? null
    : commentSummary(commentDeadline, hasCommentOption, locale, isUpcoming);
  const summaryConfidence = officialSourceFallback ? null : confidenceLabel(card, locale);
  const createdTimestamp = formatPacificTimestamp(card.created_at);
  const updatedTimestamp = formatPacificTimestamp(card.updated_at);
  const cardJurisdictionLabel = jurisdictionLabel(card);
  const meetingPageHref = meetingHref(card);
  const primaryButtonClass = "action-emphasis-sm";
  const showSantaBarbaraInterest =
    (card.jurisdiction_slug || meeting?.jurisdiction_slug) ===
    SANTA_BARBARA_INTEREST_JURISDICTION;
  const interestActivityAt = latestIsoTimestamp(
    card.updated_at,
    outcome?.updated_at
  );
  const dateParts = meetingDateParts(meeting?.date_text, meeting?.meeting_datetime, locale);
  // One source of truth for "the reader can still act on this", so the rail tick,
  // the rail note and the state line can never disagree. Gating only on
  // commentDeadline previously flagged past items as open.
  const isOpenForComment = isUpcoming && hasCommentOption && !officialSourceFallback;
  // The rail tick encodes where this item sits in its lifecycle, so the column
  // reads at a glance: ochre = you can still act, blue = ahead but no comment
  // path listed, plain = already happened.
  const railVariant = isOpenForComment
    ? "date-rail--open"
    : isUpcoming
      ? "date-rail--upcoming"
      : "";

  return (
    <article
      className={cn(
        // The list card must not clip, so a hover disclosure can open past its
        // edge. The share view renders that disclosure inline, so it can clip.
        isSharePresentation ? "quiet-card overflow-hidden rounded-xl" : "docket-item"
      )}
      data-card-id={card.id}
    >
      <div
        className={cn(
          isSharePresentation
            ? "grid gap-4 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:p-8"
            : "docket-row"
        )}
      >
        {!isSharePresentation ? (
          <div className={cn("date-rail", railVariant)}>
            {dateParts ? (
              <>
                <span className="rail-month">{dateParts.month}</span>
                <span className="rail-day">{dateParts.day}</span>
              </>
            ) : (
              <span className="rail-month">—</span>
            )}
            {isOpenForComment ? (
              <span className="rail-note rail-note--open">
                {locale === "es" ? "Abierto" : "Open"}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="min-w-0">
          <p className="committee-eyebrow">
            <HighlightedText
              text={meeting ? displayMeetingType(meeting, t(locale, "meetingTypeNotListed"), locale) : t(locale, "meetingTypeNotListed")}
              query={highlight}
            />
            <span aria-hidden className="mx-1.5 text-[color:var(--rule-strong)]">·</span>
            <HighlightedText text={cardJurisdictionLabel} query={highlight} />
          </p>
          <TitleTag
            className={cn(
              "mt-1 line-clamp-3 text-[17px] font-semibold leading-[1.3] tracking-tight text-ink sm:line-clamp-2 sm:text-[18px]",
              isSharePresentation &&
                (officialSourceFallback
                  ? "line-clamp-3 text-3xl sm:line-clamp-3 sm:text-4xl"
                  : "line-clamp-none text-3xl sm:line-clamp-none sm:text-4xl")
            )}
          >
            <HighlightedText text={agendaTitle} query={highlight} />
          </TitleTag>
          {titlePreview && !officialSourceFallback ? (
            <p
              className={cn(
                "prose-summary mt-1.5 line-clamp-2 max-w-[64ch]",
                isSharePresentation &&
                  (officialSourceFallback
                    ? "line-clamp-3 max-w-[70ch] text-[17px] leading-[1.65] sm:line-clamp-3"
                    : "line-clamp-none max-w-[70ch] text-[17px] leading-[1.65] sm:line-clamp-none")
              )}
            >
              <HighlightedText text={titlePreview} query={highlight} />
            </p>
          ) : null}
          <div className="meta-line mt-2.5">
            {fallbackInfo ? (
              <span className="state state--alert">
                <HighlightedText text={fallbackInfo.label} query={highlight} />
              </span>
            ) : null}
            {comment ? (
              <span className={cn("state", comment.className)}>
                <HighlightedText text={comment.label} query={highlight} />
              </span>
            ) : (
              <span className={cn("state", status.className)}>
                <HighlightedText text={status.label} query={highlight} />
              </span>
            )}
            <span>
              <HighlightedText text={topicLabel} query={highlight} />
            </span>
            {isSharePresentation ? (
              <span>
                <HighlightedText text={compactMeetingDate} query={highlight} />
              </span>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            isSharePresentation ? "sm:justify-end" : "col-start-2 sm:col-start-3 sm:justify-end"
          )}
        >
          {showSantaBarbaraInterest ? (
            <SantaBarbaraInterestButton
              activityAt={interestActivityAt}
              cardId={card.id}
              locale={locale}
              meetingDate={meetingDate}
              meetingStatus={meeting?.status || null}
              showDisclosure={isSharePresentation}
              title={agendaTitle}
            />
          ) : null}
          <CardShareActions
            cardId={card.id}
            compact
            locale={locale}
          />
          {!isSharePresentation ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className={primaryButtonClass}
              aria-expanded={open}
            >
              {officialSourceFallback
                ? open
                  ? locale === "es" ? "Ocultar texto oficial" : "Hide official text"
                  : locale === "es" ? "Mostrar texto oficial" : "Show official text"
                : open
                  ? t(locale, "hideSummary")
                  : t(locale, "readSummary")}
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
              />
            </button>
          ) : null}
        </div>
      </div>

      {showDetails ? (
        <div
          className={cn(
            "border-t border-rule bg-paper px-4 py-5 sm:px-5",
            !isSharePresentation && "sm:pl-[5.25rem]",
            isSharePresentation && "px-6 py-7 sm:px-8 sm:py-8"
          )}
        >
          {officialSourceFallback ? (
            <section className={cn("prose-summary max-w-[70ch]", isSharePresentation && "text-[17px]")}>
              <p className="label-eyebrow">
                {locale === "es" ? "Texto de la agenda oficial" : "Official agenda text"}
              </p>
              <div className="mt-2 space-y-2">
                {points.map((point) => (
                  <p key={point}>
                    <HighlightedText text={point} query={highlight} />
                  </p>
                ))}
              </div>
              <p className="mt-3 font-sans text-[12.5px] font-normal text-quiet">
                {locale === "es"
                  ? "Basado en la agenda oficial. SimpleCity no ha resumido ni interpretado este texto."
                  : "Based on the official agenda. SimpleCity has not summarized or interpreted this text."}
              </p>
            </section>
          ) : (
            <div
              className={cn(
                "grid gap-6 lg:grid-cols-[1fr_1fr_1.05fr] lg:gap-8",
                isSharePresentation && "lg:gap-10"
              )}
            >
              <section className="prose-summary">
                <p className="label-eyebrow font-sans">{t(locale, "whatIsHappening")}</p>
                <ul className="mt-2 space-y-1.5">
                  {points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-sm bg-[color:var(--rule-strong)]" />
                      <span><HighlightedText text={point} query={highlight} /></span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="prose-summary">
                <p className="label-eyebrow font-sans">{t(locale, "whyItMatters")}</p>
                <p className="mt-2">
                  <HighlightedText
                    text={card.why_it_matters || t(locale, "notListedInSource")}
                    query={highlight}
                  />
                </p>
                <p className="label-eyebrow mt-4 font-sans">{t(locale, "whoIsAffected")}</p>
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

              <section className="prose-summary">
                <p className="label-eyebrow font-sans text-open">{t(locale, "howToAct")}</p>
                <div className="mt-2 grid gap-2.5">
                  <p>
                    <span className="font-sans text-[13px] font-semibold text-ink">{locale === "es" ? "Asistir: " : "Attend: "}</span>
                    <HighlightedText
                      text={card.how_to_act_attend || t(locale, "notListedInSource")}
                      query={highlight}
                    />
                  </p>
                  <p>
                    <span className="font-sans text-[13px] font-semibold text-ink">Email: </span>
                    <HighlightedText
                      text={card.how_to_act_email || t(locale, "notListedInSource")}
                      query={highlight}
                    />
                  </p>
                  <p>
                    <span className="font-sans text-[13px] font-semibold text-ink">{t(locale, "submitComment")}: </span>
                    <HighlightedText
                      text={card.how_to_act_submit_comment || t(locale, "notListedInSource")}
                      query={highlight}
                    />
                  </p>
                </div>
              </section>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 border-t border-rule pt-4 text-[13px] font-normal text-slate sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="record-value"><HighlightedText text={meetingDate} query={highlight} /></span>
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
                  {officialSourceFallback
                    ? locale === "es" ? "Ver fuente oficial" : "View official source"
                    : t(locale, "source")}
                  <ExternalLink aria-hidden className="h-4 w-4" />
                </a>
              ) : null}
              {summaryConfidence ? (
                <span className="text-[12.5px] font-normal text-quiet">{summaryConfidence}</span>
              ) : null}
            </div>
            {createdTimestamp ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-normal text-quiet sm:justify-end sm:text-right">
                <span>
                  {locale === "es" ? "Publicado" : "Posted"}{" "}
                  <HighlightedText text={createdTimestamp} query={highlight} />
                </span>
                {updatedTimestamp && updatedTimestamp !== createdTimestamp ? (
                  <span>
                    {locale === "es" ? "Actualizado" : "Updated"}{" "}
                    <HighlightedText text={updatedTimestamp} query={highlight} />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {outcome ? (
        <DecisionOutcomePanel
          outcome={outcome}
          locale={locale}
          defaultExpanded={defaultOutcomeExpanded || isSharePresentation}
        />
      ) : null}
    </article>
  );
}
