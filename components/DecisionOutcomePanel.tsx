"use client";

import {
  Ban,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  ExternalLink,
  Pause,
  Users
} from "lucide-react";
import { useState } from "react";
import type { DecisionOutcome, DecisionOutcomeKind } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

function decidedAtLabel(value: string, locale: "en" | "es") {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles"
  }).format(parsed);
}

// A recorded outcome is history, so the panel itself stays neutral — five
// colored washes made every decided item shout louder than the live ones. The
// verdict rides on the icon and label instead, which also keeps it legible
// without relying on color alone.
// The expanded summary body above this is also on `paper`, so the seam between
// them needs the stronger rule to register as a new section.
const OUTCOME_CONTAINER = "border-[color:var(--rule-strong)] bg-paper";

const outcomeStyles: Record<
  DecisionOutcomeKind,
  { icon: string; label: string; Icon: typeof Check }
> = {
  approved: {
    icon: "bg-affirm text-white",
    label: "text-affirm",
    Icon: Check
  },
  rejected: {
    icon: "bg-deny text-white",
    label: "text-deny",
    Icon: Ban
  },
  continued: {
    icon: "bg-open text-white",
    label: "text-open",
    Icon: Pause
  },
  amended: {
    icon: "bg-brand text-white",
    label: "text-brand",
    Icon: ClipboardCheck
  },
  other: {
    icon: "bg-slate text-white",
    label: "text-slate",
    Icon: CircleDot
  }
};

export function isLongDecisionOutcomeSummary(summary: string) {
  return summary.trim().length > 240;
}

export function DecisionOutcomePanel({
  outcome,
  locale = "en",
  defaultExpanded = false
}: {
  outcome: DecisionOutcome;
  locale?: "en" | "es";
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const style = outcomeStyles[outcome.kind];
  const OutcomeIcon = style.Icon;
  const hasLongSummary = isLongDecisionOutcomeSummary(outcome.summary);
  const hasDetails = Boolean(outcome.vote || outcome.next_step || outcome.source_url);
  const updateLabel = locale === "es" ? "Actualización de la decisión" : "Decision update";
  const detailLabel = expanded
    ? locale === "es"
      ? "Ocultar detalles"
      : "Hide update details"
    : locale === "es"
      ? "Ver detalles"
      : "View update details";

  return (
    <section
      aria-label={updateLabel}
      className={cn("relative border-t px-4 py-3.5 sm:px-5 sm:py-4", OUTCOME_CONTAINER)}
    >
      <div
        aria-hidden
        className="absolute bottom-0 left-6 top-0 hidden w-px bg-current opacity-20 sm:block"
      />
      <div className="relative sm:pl-12">
        <span
          aria-hidden
          className={cn(
            "mb-2 flex h-8 w-8 items-center justify-center rounded-full shadow-sm sm:absolute sm:left-0 sm:top-0 sm:mb-0",
            style.icon
          )}
        >
          <OutcomeIcon className="h-4 w-4" strokeWidth={2.5} />
        </span>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className={cn("text-xs font-semibold uppercase tracking-[0.08em]", style.label)}>
              {updateLabel}
            </p>
            <h4 className={cn("mt-0.5 text-lg font-semibold leading-tight sm:text-xl", style.label)}>
              {outcome.headline}
            </h4>
            <p
              className={cn(
                "mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate",
                hasLongSummary && !summaryExpanded && "line-clamp-3"
              )}
            >
              {outcome.summary}
            </p>
            {hasLongSummary ? (
              <button
                type="button"
                className={cn(
                  "mt-1 text-sm font-bold underline decoration-current/30 underline-offset-4 hover:decoration-current",
                  style.label
                )}
                onClick={() => setSummaryExpanded((value) => !value)}
                aria-expanded={summaryExpanded}
              >
                {summaryExpanded
                  ? locale === "es" ? "Mostrar menos" : "Show less"
                  : locale === "es" ? "Mostrar resultado completo" : "Show full result"}
              </button>
            ) : null}
          </div>
          {outcome.decided_at ? (
            <p className="shrink-0 text-xs font-bold text-quiet sm:pt-0.5">
              {locale === "es" ? "Decidido" : "Decided"}{" "}
              {decidedAtLabel(outcome.decided_at, locale)}
              <span className="sr-only">.</span>
            </p>
          ) : null}
        </div>

        {hasDetails ? (
          <>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={cn("mt-2 -ml-2 action-link text-sm", style.label)}
              aria-expanded={expanded}
            >
              {detailLabel}
              <ChevronDown
                aria-hidden
                className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
              />
            </button>

            {expanded ? (
              <div className="mt-2">
                {outcome.vote || outcome.next_step ? (
                  <dl className="grid overflow-hidden rounded-md border border-rule bg-surface sm:grid-cols-[0.8fr_1.6fr]">
                    {outcome.vote ? (
                      <div className="flex gap-2.5 px-3 py-2.5 sm:border-r sm:border-rule">
                        <Users aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", style.label)} />
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.06em] text-quiet">
                            {locale === "es" ? "Votación" : "Vote"}
                          </dt>
                          <dd className="mt-0.5 text-sm font-semibold text-ink">{outcome.vote}</dd>
                        </div>
                      </div>
                    ) : null}
                    {outcome.next_step ? (
                      <div className="flex gap-2.5 border-t border-rule px-3 py-2.5 sm:border-t-0">
                        <ClipboardCheck
                          aria-hidden
                          className={cn("mt-0.5 h-4 w-4 shrink-0", style.label)}
                        />
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.06em] text-quiet">
                            {locale === "es" ? "Lo que sigue" : "What happens next"}
                          </dt>
                          <dd className="mt-0.5 text-sm font-semibold leading-5 text-ink">
                            {outcome.next_step}
                          </dd>
                        </div>
                      </div>
                    ) : null}
                  </dl>
                ) : null}

                {outcome.source_url ? (
                  <a
                    href={outcome.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn("mt-2 action-link text-sm", style.label)}
                  >
                    {locale === "es" ? "Ver resultado de la reunión" : "View meeting result"}
                    <ExternalLink aria-hidden className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
