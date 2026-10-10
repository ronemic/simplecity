import type { Metadata } from "next";
import { CalendarDays, ExternalLink } from "lucide-react";
import { getPageLocale, getRequestLocale } from "@/lib/i18n/server";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";
import { PropositionCard } from "@/components/PropositionCard";
import {
  ELECTION_DATES,
  OFFICIAL_GUIDE_URL,
  PROPOSITION_GROUPS
} from "@/lib/elections/california2026";

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  const locale = await getPageLocale(lang);
  const title =
    locale === "es"
      ? "Propuestas de California de noviembre de 2026 | SimpleCity"
      : "California November 2026 Propositions | SimpleCity";
  const description =
    locale === "es"
      ? "Resúmenes en lenguaje claro de las 14 propuestas estatales en la boleta del 3 de noviembre de 2026 en California."
      : "Plain-language summaries of all 14 statewide propositions on California's November 3, 2026 ballot.";
  const urls = localizedSeoUrls("/elections", seoLocale(lang));

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages },
    openGraph: { title, description, type: "website", url: urls.canonical, siteName: "SimpleCity" },
    twitter: { card: "summary", title, description }
  };
}

export const revalidate = 300;

export default async function ElectionsPage() {
  const locale = await getRequestLocale();
  const es = locale === "es";

  return (
    <div className="section-shell py-10">
      <p className="label-eyebrow !text-civic">
        {es ? "Elección general de California" : "California General Election"}
      </p>
      <h1 className="page-title mt-2">
        {es ? "Propuestas estatales de noviembre de 2026" : "November 2026 statewide propositions"}
      </h1>
      <p className="page-copy mt-4 !max-w-none">
        {es
          ? "Resúmenes en lenguaje claro de las 14 propuestas en la boleta, basados en la Guía Oficial de Información para el Votante del Secretario de Estado. Las afirmaciones de las campañas se identifican como tales. SimpleCity no recomienda cómo votar."
          : "Plain-language summaries of all 14 propositions on the ballot, based on the Secretary of State's Official Voter Information Guide. Campaign claims are labeled as such. SimpleCity does not recommend how to vote."}
      </p>

      <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
        {[
          { label: es ? "Se envían las boletas" : "Ballots mailed by", date: ELECTION_DATES.ballotsMailed },
          {
            label: es ? "Último día para inscribirse" : "Last day to register",
            date: ELECTION_DATES.registrationDeadline
          },
          {
            label: es ? "Día de la elección (7 a.m. – 8 p.m.)" : "Election Day (polls 7am–8pm)",
            date: ELECTION_DATES.electionDay
          }
        ].map(({ label, date }) => (
          <li key={label} className="quiet-card flex items-start gap-3 p-4">
            <CalendarDays aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-civic" />
            <span>
              <span className="block font-semibold text-black/60">{label}</span>
              <span className="block font-bold text-ink">{date[locale]}</span>
            </span>
          </li>
        ))}
      </ul>

      <nav aria-label={es ? "Propuestas" : "Propositions"} className="mt-6 flex flex-wrap gap-2">
        {PROPOSITION_GROUPS.flatMap((group) => group.propositions)
          .sort((a, b) => a.number - b.number)
          .map((prop) => (
            <a
              key={prop.number}
              href={`#prop-${prop.number}`}
              className="rounded-full border border-black/10 px-3 py-1 text-sm font-semibold text-ink hover:border-civic/40 hover:text-civic"
            >
              {es ? "Prop." : "Prop"} {prop.number}
            </a>
          ))}
      </nav>

      {PROPOSITION_GROUPS.map((group) => (
        <section key={group.id} id={group.id} className="mt-10 scroll-mt-24">
          <h2 className="label-eyebrow !text-civic">{group.heading[locale]}</h2>
          {group.note ? (
            <p className="mt-3 rounded-lg border border-civic/20 bg-civic/[0.04] p-4 text-sm leading-6 text-ink">
              {group.note[locale]}
            </p>
          ) : null}
          <div className="mt-4 grid gap-4">
            {group.propositions.map((prop) => (
              <PropositionCard
                key={prop.number}
                prop={prop}
                groupId={group.id}
                groupLabel={group.heading[locale]}
                locale={locale}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-10 text-sm font-semibold text-black/70">
        {es
          ? "Lea los textos completos, análisis y argumentos en la"
          : "Read the full text, analysis, and arguments in the"}{" "}
        <a
          href={OFFICIAL_GUIDE_URL[locale]}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-bold text-civic underline decoration-civic/30 underline-offset-4 hover:decoration-civic"
        >
          {es ? "Guía Oficial de Información para el Votante" : "Official Voter Information Guide"}
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </a>
      </p>
    </div>
  );
}
