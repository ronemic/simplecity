import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { CalendarDays, ExternalLink, Users } from "lucide-react";
import { getPageLocale, getRequestLocale } from "@/lib/i18n/server";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";
import { PropositionCard } from "@/components/PropositionCard";
import { LocalMeasureCard } from "@/components/LocalMeasureCard";
import {
  ALL_JURISDICTIONS_SLUG,
  getJurisdictionLabel,
  getPublicJurisdictionOptions,
  JURISDICTION_PREFERENCE_COOKIE,
  normalizeJurisdictionSelection,
  toInternalJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { getPublishedCard } from "@/lib/db/queries";
import { cardSharePath } from "@/lib/utils/cardShare";
import { cn } from "@/lib/utils/cn";
import {
  ELECTION_DATES,
  electionsPromoHref,
  OFFICIAL_GUIDE_URL,
  PROPOSITION_GROUPS
} from "@/lib/elections/california2026";
import {
  COUNTY_VOTER_TOOLS,
  getBallotFor,
  SCOPE_ORDER,
  type BallotSection,
  type MeasureScope
} from "@/lib/elections/local2026";
import type { Locale } from "@/lib/i18n";

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  const locale = await getPageLocale(lang);
  const title =
    locale === "es"
      ? "Su boleta del 3 de noviembre de 2026 | SimpleCity"
      : "Your November 3, 2026 Ballot | SimpleCity";
  const description =
    locale === "es"
      ? "Resúmenes en lenguaje claro de las medidas locales, las contiendas locales y las 14 propuestas estatales en la boleta del 3 de noviembre de 2026 en California."
      : "Plain-language summaries of the local measures, local races, and all 14 statewide propositions on California's November 3, 2026 ballot.";
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

const SCOPE_HEADINGS: Record<MeasureScope, { en: string; es: string }> = {
  city: { en: "City measures", es: "Medidas de la ciudad" },
  county: { en: "County measures", es: "Medidas del condado" },
  regional: { en: "Regional measures", es: "Medidas regionales" },
  school: { en: "School and college measures", es: "Medidas escolares y universitarias" },
  special: { en: "Special district measures", es: "Medidas de distritos especiales" }
};

/** Placement links are hand-entered card ids; hide any that no longer resolve. */
async function resolvePlacementHrefs(sections: BallotSection[], locale: Locale) {
  const ids = [
    ...new Set(
      sections.flatMap((section) =>
        section.measures.flatMap((measure) => (measure.placement ? [measure.placement.cardId] : []))
      )
    )
  ];
  const found = await Promise.all(
    ids.map(async (id) => {
      try {
        return (await getPublishedCard(id, locale)) ? id : null;
      } catch {
        return null;
      }
    })
  );
  return new Map(
    found.filter((id): id is string => Boolean(id)).map((id) => [id, cardSharePath(id)])
  );
}

export default async function ElectionsPage({
  searchParams
}: {
  searchParams: Promise<{ jurisdiction?: string; lang?: string }>;
}) {
  const [params, locale, cookieStore] = await Promise.all([
    searchParams,
    getRequestLocale(),
    cookies()
  ]);
  const es = locale === "es";
  const requested =
    params.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value;
  const selection = requested
    ? normalizeJurisdictionSelection(requested)
    : ALL_JURISDICTIONS_SLUG;
  const isAll = selection === ALL_JURISDICTIONS_SLUG;
  const selectionLabel = getJurisdictionLabel(selection, locale);
  const sections = getBallotFor(selection);
  const placementHrefs = await resolvePlacementHrefs(sections, locale);
  const singlePlace = !isAll && sections.length === 1 && sections[0].county !== selection;

  return (
    <div className="section-shell py-10">
      <p className="label-eyebrow !text-civic">
        {es ? "Elección general de California" : "California General Election"}
      </p>
      <h1 className="page-title mt-2">
        {isAll
          ? es ? "Su boleta del 3 de noviembre" : "Your November 3 ballot"
          : es ? `Su boleta del 3 de noviembre: ${selectionLabel}` : `Your November 3 ballot: ${selectionLabel}`}
      </h1>
      <p className="page-copy mt-4 !max-w-none">
        {es
          ? "Resúmenes en lenguaje claro de las medidas locales y las 14 propuestas estatales, basados en fuentes oficiales del condado, la ciudad y el Secretario de Estado. Las afirmaciones de las campañas se identifican como tales. SimpleCity no recomienda cómo votar."
          : "Plain-language summaries of local measures and all 14 statewide propositions, based on official county, city, and Secretary of State sources. Campaign claims are labeled as such. SimpleCity does not recommend how to vote."}
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

      <nav aria-label={es ? "Elegir lugar" : "Choose a place"} className="mt-8">
        <p className="text-sm font-semibold text-black/60">
          {es ? "Vea lo que hay en la boleta de:" : "See what's on the ballot in:"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {getPublicJurisdictionOptions().map((option) => {
            const slug = normalizeJurisdictionSelection(toInternalJurisdictionSlug(option.slug));
            const current = slug === selection;
            return (
              <Link
                key={option.slug}
                href={electionsPromoHref(slug, locale)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-semibold",
                  current
                    ? "border-civic bg-civic text-white"
                    : "border-black/10 text-ink hover:border-civic/40 hover:text-civic"
                )}
              >
                {getJurisdictionLabel(slug, locale)}
              </Link>
            );
          })}
        </div>
      </nav>

      <h2 id="local" className="mt-10 scroll-mt-24 text-2xl font-black text-ink">
        {es ? "Medidas y contiendas locales" : "Local measures and races"}
      </h2>

      {sections.map((section) => {
        const tools = COUNTY_VOTER_TOOLS[section.county];
        const scopes = SCOPE_ORDER.filter((scope) =>
          section.measures.some((measure) => measure.scope === scope)
        );

        return (
          <section key={section.county} className="mt-6">
            {isAll ? (
              <h3 className="label-eyebrow !text-civic">
                {getJurisdictionLabel(section.county, locale)}
              </h3>
            ) : null}

            {section.contests.length > 0 ? (
              <div className="quiet-card mt-4 p-4 sm:p-5">
                <p className="flex items-center gap-2 text-xs font-black uppercase text-black/[0.55]">
                  <Users aria-hidden className="h-4 w-4" />
                  {es ? "Contiendas locales" : "Local races"}
                </p>
                <ul className="mt-3 grid gap-2 text-sm leading-6 text-black/75">
                  {section.contests.map((contest) => (
                    <li key={`${contest.jurisdiction}-${contest.office.en}`}>
                      <span className="font-bold text-ink">{contest.office[locale]}</span>
                      {" · "}
                      {contest.seats[locale]}{" "}
                      <a
                        href={contest.officialUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-civic underline decoration-civic/30 underline-offset-4 hover:decoration-civic"
                      >
                        {es ? "Candidatos" : "Candidates"}
                        <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {scopes.map((scope) => (
              <div key={scope} className="mt-6">
                <h4 className="text-sm font-black uppercase text-black/[0.55]">
                  {SCOPE_HEADINGS[scope][locale]}
                </h4>
                <div className="mt-3 grid gap-4">
                  {section.measures
                    .filter((measure) => measure.scope === scope)
                    .map((measure) => (
                      <LocalMeasureCard
                        key={measure.id}
                        measure={measure}
                        placementHref={
                          measure.placement ? placementHrefs.get(measure.placement.cardId) : undefined
                        }
                        placeLabel={singlePlace ? selectionLabel : undefined}
                        locale={locale}
                      />
                    ))}
                </div>
              </div>
            ))}

            {section.measures.length === 0 ? (
              <p className="mt-4 text-sm font-semibold text-black/70">
                {es
                  ? "No encontramos medidas locales confirmadas oficialmente para este lugar."
                  : "We found no officially confirmed local measures for this place."}
              </p>
            ) : null}

            <p className="mt-4 text-sm font-semibold text-black/70">
              {es
                ? "Las medidas y contiendas en su boleta dependen de su dirección. Vea su boleta de muestra en"
                : "The measures and races on your ballot depend on your address. See your sample ballot at"}{" "}
              <a
                href={tools.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-bold text-civic underline decoration-civic/30 underline-offset-4 hover:decoration-civic"
              >
                {tools.name[locale]}
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </a>
            </p>
          </section>
        );
      })}

      <h2 id="statewide" className="mt-12 scroll-mt-24 text-2xl font-black text-ink">
        {es ? "Propuestas estatales" : "Statewide propositions"}
      </h2>

      <nav aria-label={es ? "Propuestas" : "Propositions"} className="mt-4 flex flex-wrap gap-2">
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
          <h3 className="label-eyebrow !text-civic">{group.heading[locale]}</h3>
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
