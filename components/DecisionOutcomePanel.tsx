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

const outcomeStyles: Record<
  DecisionOutcomeKind,
  { container: string; icon: string; label: string; Icon: typeof Check }
> = {
  approved: {
    container: "border-[#9fc6b2] bg-[#f1fbf4]",
    icon: "bg-[#237a49] text-white",
    label: "text-[#17683b]",
    Icon: Check
  },
  rejected: {
    container: "border-[#e2b4b0] bg-[#fff4f2]",
    icon: "bg-[#a83a31] text-white",
    label: "text-[#8f2e26]",
    Icon: Ban
  },
  continued: {
    container: "border-[#e7c879] bg-[#fff9ea]",
    icon: "bg-[#a56308] text-white",
    label: "text-[#86500b]",
    Icon: Pause
  },
  amended: {
    container: "border-[#a9c2e7] bg-[#f1f6fd]",
    icon: "bg-civic text-white",
    label: "text-civic",
    Icon: ClipboardCheck
  },
  other: {
    container: "border-[#bcc8d1] bg-[#f5f8fa]",
    icon: "bg-[#42677f] text-white",
    label: "text-[#31546c]",
    Icon: CircleDot
  }
};

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
  const style = outcomeStyles[outcome.kind];
  const OutcomeIcon = style.Icon;
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
      className={cn("relative border-t px-4 py-5 sm:px-5 sm:py-6", style.container)}
    >
      <div
        aria-hidden
        className="absolute bottom-0 left-7 top-0 hidden w-px bg-current opacity-20 sm:block"
      />
      <div className="relative sm:pl-16">
        <span
          aria-hidden
          className={cn(
            "mb-3 flex h-9 w-9 items-center justify-center rounded-full shadow-sm sm:absolute sm:-left-1 sm:top-0 sm:mb-0",
            style.icon
          )}
        >
          <OutcomeIcon className="h-5 w-5" strokeWidth={2.4} />
        </span>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className={cn("text-xs font-black uppercase tracking-[0.08em]", style.label)}>
              {updateLabel}
            </p>
            <h4 className={cn("mt-1 text-xl font-black leading-tight sm:text-2xl", style.label)}>
              {outcome.headline}
            </h4>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-black/70 sm:text-base sm:leading-7">
              {outcome.summary}
            </p>
          </div>
          {outcome.decided_at ? (
            <p className="shrink-0 text-xs font-bold text-black/50 sm:pt-1">
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
              className={cn("mt-3 -ml-2 action-link", style.label)}
              aria-expanded={expanded}
            >
              {detailLabel}
              <ChevronDown
                aria-hidden
                className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
              />
            </button>

            {expanded ? (
              <div className="mt-3">
                {outcome.vote || outcome.next_step ? (
                  <dl className="grid overflow-hidden rounded-lg border border-current/15 bg-white/75 sm:grid-cols-[0.8fr_1.6fr]">
                    {outcome.vote ? (
                      <div className="flex gap-3 px-4 py-3 sm:border-r sm:border-current/15">
                        <Users aria-hidden className={cn("mt-0.5 h-5 w-5 shrink-0", style.label)} />
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.06em] text-black/45">
                            {locale === "es" ? "Votación" : "Vote"}
                          </dt>
                          <dd className="mt-0.5 text-sm font-black text-ink">{outcome.vote}</dd>
                        </div>
                      </div>
                    ) : null}
                    {outcome.next_step ? (
                      <div className="flex gap-3 border-t border-current/15 px-4 py-3 sm:border-t-0">
                        <ClipboardCheck
                          aria-hidden
                          className={cn("mt-0.5 h-5 w-5 shrink-0", style.label)}
                        />
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.06em] text-black/45">
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
                    className={cn("mt-2 action-link", style.label)}
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
