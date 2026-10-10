"use client";

import { CalendarDays, ChevronDown, ExternalLink, HeartPulse, House, Landmark, Receipt, Vote } from "lucide-react";
import { useState } from "react";
import { DateStack } from "@/components/DateStack";
import { cn } from "@/lib/utils/cn";
import { type Locale, t } from "@/lib/i18n";
import {
  ELECTION_DATES,
  officialPropositionUrl,
  type Proposition
} from "@/lib/elections/california2026";

const GROUP_ICONS = {
  housing: House,
  taxes: Receipt,
  voting: Vote,
  health: HeartPulse
} as const;

function sentences(text: string) {
  return text.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿])/);
}

/**
 * Laid out like SummaryCard so a ballot measure reads like any other decision,
 * minus the follow/share actions, which need a stored card id.
 */
export function PropositionCard({
  prop,
  groupId,
  groupLabel,
  locale
}: {
  prop: Proposition;
  groupId: keyof typeof GROUP_ICONS;
  groupLabel: string;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const es = locale === "es";
  const TopicIcon = GROUP_ICONS[groupId] || Landmark;
  const points = sentences(prop.summary[locale]);
  const electionDay = ELECTION_DATES.electionDay[locale];
  const origin =
    prop.origin === "legislature"
      ? es ? "Incluida por la Legislatura" : "Placed by the Legislature"
      : es ? "Incluida por firmas de una petición" : "Placed by petition signatures";

  return (
    <article id={`prop-${prop.number}`} className="quiet-card scroll-mt-24 [&>*:last-child]:rounded-b-lg">
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
            <span>{es ? "Propuesta estatal" : "Statewide proposition"}</span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-black/25" />
            <span>California</span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-black/25" />
            <span>{origin}</span>
          </div>
          <h3 className="mt-1 line-clamp-3 text-balance text-xl font-black leading-snug text-ink sm:line-clamp-2">
            {es ? "Propuesta" : "Prop"} {prop.number}: {prop.title[locale]}
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
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="icon-badge">
                <TopicIcon className="h-3.5 w-3.5" />
              </span>
              {groupLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.07] bg-[#fbfcfd] px-4 py-3 sm:px-5">
        <a
          href={officialPropositionUrl(prop.number, locale)}
          target="_blank"
          rel="noreferrer"
          className="action-link"
        >
          {es ? "Guía oficial" : "Official guide"}
          <ExternalLink aria-hidden className="h-4 w-4" />
        </a>
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
                  {prop.yes[locale]}
                </p>
                <p>
                  <span className="font-bold text-ink">NO: </span>
                  {prop.no[locale]}
                </p>
              </div>
            </section>

            <section>
              <p className="text-xs font-black uppercase text-[#8e452e]">
                {es ? "Costo y debate" : "Cost and debate"}
              </p>
              <div className="mt-2 grid gap-3">
                <p>
                  <span className="font-bold text-ink">{es ? "Impacto fiscal: " : "Cost: "}</span>
                  {prop.cost[locale]}
                </p>
                {prop.debate ? (
                  <p>
                    <span className="font-bold text-ink">{es ? "El debate: " : "The debate: "}</span>
                    {prop.debate[locale]}
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4 text-sm font-semibold text-black/[0.68]">
            <span>{es ? `Día de la elección: ${electionDay}` : `Election Day: ${electionDay}`}</span>
            <a
              href={officialPropositionUrl(prop.number, locale)}
              target="_blank"
              rel="noreferrer"
              className="action-link"
            >
              {t(locale, "source")}
              <ExternalLink aria-hidden className="h-4 w-4" />
            </a>
          </div>
        </div>
      ) : null}
    </article>
  );
}
