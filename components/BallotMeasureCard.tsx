"use client";

import { CalendarDays, ChevronDown, ExternalLink, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DateStack } from "@/components/DateStack";
import { cn } from "@/lib/utils/cn";
import { type Locale, t } from "@/lib/i18n";
import { ELECTION_DATES } from "@/lib/elections/california2026";

function sentences(text: string) {
  return text.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿])/);
}

export type BallotMeasureCardProps = {
  anchorId: string;
  eyebrow: string[];
  heading: string;
  summary: string;
  yes: string;
  no: string;
  cost?: string;
  debate?: string;
  /** e.g. "Passes with: two-thirds" */
  threshold?: string;
  /** e.g. "On some ballots in Menlo Park" */
  scopeNote?: string;
  topic?: { icon: LucideIcon; label: string };
  officialUrl: string;
  officialLabel: string;
  /** The SimpleCity decision card where the measure was placed on the ballot. */
  placement?: { href: string; label: string };
  locale: Locale;
};

/**
 * Laid out like SummaryCard so a ballot measure reads like any other decision,
 * minus the follow/share actions, which need a stored card id.
 */
export function BallotMeasureCard({
  anchorId,
  eyebrow,
  heading,
  summary,
  yes,
  no,
  cost,
  debate,
  threshold,
  scopeNote,
  topic,
  officialUrl,
  officialLabel,
  placement,
  locale
}: BallotMeasureCardProps) {
  const [open, setOpen] = useState(false);
  const es = locale === "es";
  const points = sentences(summary);
  const electionDay = ELECTION_DATES.electionDay[locale];
  const TopicIcon = topic?.icon;

  return (
    <article id={anchorId} className="quiet-card scroll-mt-24 [&>*:last-child]:rounded-b-lg">
      <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
        <DateStack
          month={es ? "nov" : "Nov"}
          day={3}
          weekday={es ? "mar" : "Tue"}
          dateTime="2026-11-03"
          title={electionDay}
          className="hidden pt-0.5 sm:flex"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold leading-5 text-black/[0.58]">
            {eyebrow.map((part, index) => (
              <span key={`${index}-${part}`} className="contents">
                {index > 0 ? <span aria-hidden className="h-1 w-1 rounded-full bg-black/25" /> : null}
                <span>{part}</span>
              </span>
            ))}
          </div>
          <h3 className="mt-1 line-clamp-3 text-balance text-xl font-black leading-snug text-ink sm:line-clamp-2">
            {heading}
          </h3>
          <p className="mt-1.5 line-clamp-3 max-w-3xl text-[0.95rem] font-semibold leading-6 text-black/[0.62] sm:line-clamp-2">
            {points[0]}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-black/[0.62]">
            <span className="status-chip border-[#f0c75e] bg-[#fff9e9] text-[#a54f00]">
              {es ? "Votación el 3 de nov." : "Vote Nov 3"}
            </span>
            <span className="inline-flex items-center gap-1.5 sm:hidden">
              <CalendarDays aria-hidden className="h-4 w-4 text-[#42677f]" />
              {electionDay}
            </span>
            {topic && TopicIcon ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="icon-badge">
                  <TopicIcon className="h-3.5 w-3.5" />
                </span>
                {topic.label}
              </span>
            ) : null}
            {threshold ? <span>{threshold}</span> : null}
          </div>
          {scopeNote ? (
            <p className="mt-2 text-sm font-semibold text-[#8e452e]">{scopeNote}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.07] bg-[#fbfcfd] px-4 py-3 sm:px-5">
        <a href={officialUrl} target="_blank" rel="noreferrer" className="action-link">
          {officialLabel}
          <ExternalLink aria-hidden className="h-4 w-4" />
        </a>
        {placement ? (
          <Link href={placement.href} className="action-link">
            {placement.label}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="action-primary-sm ml-auto font-black"
          aria-expanded={open}
        >
          {open ? t(locale, "hideSummary") : t(locale, "readSummary")}
          <ChevronDown aria-hidden className={cn("h-4 w-4 transition", open && "rotate-180")} />
        </button>
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
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <p className="text-xs font-black uppercase text-black/[0.55]">
                {es ? "Qué significa su voto" : "What your vote means"}
              </p>
              <div className="mt-2 grid gap-3">
                <p>
                  <span className="font-bold text-ink">{es ? "SÍ: " : "YES: "}</span>
                  {yes}
                </p>
                <p>
                  <span className="font-bold text-ink">NO: </span>
                  {no}
                </p>
              </div>
            </section>

            {cost || debate ? (
              <section>
                <p className="text-xs font-black uppercase text-[#8e452e]">
                  {es ? "Costo y debate" : "Cost and debate"}
                </p>
                <div className="mt-2 grid gap-3">
                  {cost ? (
                    <p>
                      <span className="font-bold text-ink">{es ? "Impacto fiscal: " : "Cost: "}</span>
                      {cost}
                    </p>
                  ) : null}
                  {debate ? (
                    <p>
                      <span className="font-bold text-ink">{es ? "El debate: " : "The debate: "}</span>
                      {debate}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4 text-sm font-semibold text-black/[0.68]">
            <span>{es ? `Día de la elección: ${electionDay}` : `Election Day: ${electionDay}`}</span>
            <a href={officialUrl} target="_blank" rel="noreferrer" className="action-link">
              {t(locale, "source")}
              <ExternalLink aria-hidden className="h-4 w-4" />
            </a>
          </div>
        </div>
      ) : null}
    </article>
  );
}
