import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Vote } from "lucide-react";
import { cookies } from "next/headers";
import { cache, Suspense } from "react";
import {
  HomepageContentLoading,
  HomepageContentUnavailable,
  HomepageDataContent,
  HomepageHeroStatus,
  HomepageHeroStatusLoading,
  homepageSortFromParam,
  newestHomepageMeetings,
  upcomingHomepageMeetings,
  type HomepageSort
} from "@/components/HomepageData";
import { SearchAndFilters } from "@/components/SearchAndFilters";
import { electionsPromoHref, isElectionPromoActive } from "@/lib/elections/california2026";
import { CATEGORIES, SCHOOL_CATEGORIES } from "@/lib/constants";
import {
  HOMEPAGE_LIST_CARD_COUNT,
  getDecisionCardPage,
  getHomepageContent,
  getMeetings,
  type HomepageCardSelection
} from "@/lib/db/queries";
import type { MeetingRow } from "@/lib/types";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionLabel,
  isSchoolDistrictJurisdiction,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import { t, type Locale } from "@/lib/i18n";
import { getPageLocale, getRequestLocale } from "@/lib/i18n/server";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";
import { isBetaRequest } from "@/lib/localRedesign";
import { PreviewHome } from "@/components/local-redesign/PreviewPages";

export const revalidate = 300;

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  const locale = await getPageLocale(lang);
  const title =
    locale === "es"
      ? "SimpleCity | Decisiones locales fáciles de entender"
      : "SimpleCity | Easy-to-understand local decisions";
  const description =
    locale === "es"
      ? "Encuentra próximas decisiones del gobierno local, reuniones públicas, fuentes oficiales y formas de participar en comunidades del Área de la Bahía."
      : "Find upcoming local government decisions, public meetings, official sources, and ways to participate across Bay Area communities.";
  const urls = localizedSeoUrls("/", seoLocale(lang));

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages },
    openGraph: { title, description, type: "website", url: urls.canonical, siteName: "SimpleCity" },
    twitter: { card: "summary", title, description }
  };
}

/**
 * Deduped per request so the hero status line and the decisions section can sit
 * in separate Suspense boundaries -- streaming independently -- while sharing a
 * single read. `cache` keys on argument identity, so the arguments stay
 * primitives rather than the options object the query itself takes.
 */
const homepageContent = cache(
  async (
    jurisdiction: JurisdictionSelection,
    locale: Locale,
    search: string,
    sort: HomepageSort
  ): Promise<HomepageCardSelection> => {
    // A search in the default order keeps the existing relevance ranking.
    if (search && sort === "upcoming") return getHomepageContent({ jurisdiction, locale, search });
    // Otherwise the same query and order as the decisions tab's first page.
    const { cards, totalCount } = await getDecisionCardPage({
      jurisdiction,
      locale,
      search,
      sort,
      pageSize: HOMEPAGE_LIST_CARD_COUNT
    });
    return { cards, meetingCards: cards, totalCount };
  }
);

async function HeroStatus({
  jurisdiction,
  locale,
  search,
  sort
}: {
  jurisdiction: JurisdictionSelection;
  locale: Locale;
  search: string;
  sort: HomepageSort;
}) {
  let totalCount: number | null = null;
  try {
    ({ totalCount } = await homepageContent(jurisdiction, locale, search, sort));
  } catch {
    // A missing count is not worth a visible failure in the hero, and the
    // decisions section below already reports the error and logs it once.
  }

  if (totalCount === null) return null;
  return <HomepageHeroStatus locale={locale} totalCount={totalCount} />;
}

async function HomepageDecisions({
  hasSearch,
  jurisdiction,
  jurisdictionLabel,
  locale,
  search,
  sort,
  sortLinkParams
}: {
  hasSearch: boolean;
  jurisdiction: JurisdictionSelection;
  jurisdictionLabel: string;
  locale: Locale;
  search: string;
  sort: HomepageSort;
  sortLinkParams: Record<string, string>;
}) {
  let content: HomepageCardSelection | null = null;
  let meetings: MeetingRow[] | null = null;
  const [contentResult, meetingsResult] = await Promise.allSettled([
    homepageContent(jurisdiction, locale, search, sort),
    getMeetings({ jurisdiction, locale })
  ]);
  if (contentResult.status === "fulfilled") content = contentResult.value;
  else console.error("Failed to load homepage decisions", contentResult.reason);
  if (meetingsResult.status === "fulfilled") {
    meetings = sort === "newest"
      ? newestHomepageMeetings(meetingsResult.value)
      : upcomingHomepageMeetings(meetingsResult.value);
  }
  else console.error("Failed to load homepage meetings", meetingsResult.reason);

  if (!content) return <HomepageContentUnavailable locale={locale} />;

  return (
    <HomepageDataContent
      content={content}
      hasSearch={hasSearch}
      jurisdictionLabel={jurisdictionLabel}
      locale={locale}
      meetings={meetings}
      search={search}
      sort={sort}
      sortLinkParams={sortLinkParams}
    />
  );
}

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    jurisdiction?: string;
    lang?: string;
    sort?: string;
  }>;
}) {
  const [params, locale, cookieStore] = await Promise.all([
    searchParams,
    getRequestLocale(),
    cookies()
  ]);
  const search = (params.q || "").trim();
  const sort = homepageSortFromParam(params.sort);
  const redesign = await isBetaRequest();
  const jurisdiction = normalizeJurisdictionSelection(
    params.jurisdiction || (redesign ? "all" : cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value)
  );
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction, locale);
  const topicCategories = isSchoolDistrictJurisdiction(jurisdiction)
    ? SCHOOL_CATEGORIES
    : CATEGORIES;
  if (redesign) return <PreviewHome locale={locale} jurisdiction={jurisdiction} categories={topicCategories} search={search} />;
  const hasSearch = search.length > 0;
  const showElectionPromo = isElectionPromoActive();
  const langQuery: Record<string, string> = params.lang ? { lang: params.lang } : {};
  const withQuery = (path: string, query: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ ...query, ...langQuery }).toString();
    return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
  };
  const areaLabel =
    jurisdiction === "all"
      ? locale === "es"
        ? "Mostrando todas las ciudades, condados y distritos escolares"
        : "Showing all cities, counties, and school districts"
      : locale === "es"
        ? `Mostrando ${jurisdictionLabel}`
        : `Showing ${jurisdictionLabel}`;

  return (
    <div className="overflow-hidden">
      {showElectionPromo && !hasSearch ? (
        <div className="border-b border-[#e7d5a6] bg-[#fdf6e3]">
          <div className="section-shell py-2.5">
            <Link
              href={electionsPromoHref(jurisdiction, locale)}
              className="inline-flex items-center gap-2 rounded-sm text-sm font-bold text-[#6b4e12] underline-offset-4 hover:underline focus-visible:focus-ring"
            >
              <Vote aria-hidden className="h-4 w-4 shrink-0" />
              <span>
                {locale === "es"
                  ? "Mira lo que hay en tu boleta del 3 de noviembre"
                  : "See what's on your November 3 ballot"}
              </span>
              <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        </div>
      ) : null}

      <section className="civic-hero">
        <div className={`section-shell relative z-10 ${hasSearch ? "py-6 sm:py-8" : "py-8 sm:py-12"}`}>
          <div className="max-w-3xl">
            {!hasSearch ? (
              <Link
                href={locale === "es" ? "/about?lang=es#news" : "/about#news"}
                className="mb-5 inline-flex items-center gap-2 rounded-sm text-sm font-bold text-[#9fc4f4] underline-offset-4 hover:text-white hover:underline focus-visible:focus-ring"
              >
                <span>
                  {locale === "es"
                    ? "Lee sobre SimpleCity en las noticias"
                    : "Read about SimpleCity in the news"}
                </span>
                <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
              </Link>
            ) : null}
            <h1 className="text-balance text-[30px] font-black leading-[1.1] text-[#fffaf0] sm:text-[40px]">
              {locale === "es"
                ? "Mira qué está decidiendo tu gobierno local."
                : "See what your local government is deciding."}
            </h1>
            {!hasSearch ? (
              <p className="mt-3 max-w-2xl text-base leading-7 text-[#d9e2ec] sm:text-lg sm:leading-8">
                {locale === "es"
                  ? "Resúmenes en lenguaje claro de las reuniones públicas, con enlaces a los documentos oficiales."
                  : "Plain-language summaries of public meetings, with links to the official documents."}
              </p>
            ) : null}
            <div className="mt-7 text-sm font-semibold leading-6 text-[#c9d6e3]">
              <p className="text-inherit">
                {areaLabel}
                <Suspense fallback={<HomepageHeroStatusLoading />}>
                  <HeroStatus jurisdiction={jurisdiction} locale={locale} search={search} sort={sort} />
                </Suspense>
              </p>
            </div>
            <div className="mt-3">
              <SearchAndFilters
                action={`/decisions?jurisdiction=${toPublicJurisdictionSlug(jurisdiction)}`}
                search={search}
                locale={locale}
              />
            </div>
            <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] font-semibold text-[#9fb2c6]">
              <span>{locale === "es" ? "O consulta:" : "Or go to:"}</span>
              <Link href={withQuery("/decisions")} className="rounded-sm text-[#cfe1f7] underline decoration-white/30 underline-offset-4 hover:text-white hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d7ff]">
                {locale === "es" ? "Ver decisiones actuales" : "See current decisions"}
              </Link>
              <Link href={withQuery("/meetings")} className="rounded-sm text-[#cfe1f7] underline decoration-white/30 underline-offset-4 hover:text-white hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d7ff]">
                {t(locale, "viewMeetingCalendar")}
              </Link>
              <Link href={withQuery("/decisions", { view: "map" })} className="rounded-sm text-[#cfe1f7] underline decoration-white/30 underline-offset-4 hover:text-white hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d7ff]">
                {locale === "es" ? "Explorar mapa" : "Explore map"}
              </Link>
            </p>
          </div>

        </div>
      </section>


      <Suspense fallback={<HomepageContentLoading locale={locale} />}>
        <HomepageDecisions
          hasSearch={hasSearch}
          jurisdiction={jurisdiction}
          jurisdictionLabel={jurisdictionLabel}
          locale={locale}
          search={search}
          sort={sort}
          sortLinkParams={Object.fromEntries(
            Object.entries({ q: search, jurisdiction: params.jurisdiction, lang: params.lang }).filter(
              (entry): entry is [string, string] => Boolean(entry[1])
            )
          )}
        />
      </Suspense>

      {!hasSearch ? (
        <section aria-labelledby="team-heading" className="section-shell pb-16 pt-8">
          <div className="quiet-card grid items-center gap-5 p-5 sm:p-6 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8">
            <div className="overflow-hidden rounded-lg">
              <Image
                src="/images/simplecity-team.webp"
                width={1442}
                height={1118}
                sizes="(max-width: 767px) calc(100vw - 5rem), 240px"
                alt={locale === "es"
                  ? "Ruiwen, Patrick y Samuel, el equipo detrás de SimpleCity"
                  : "Ruiwen, Patrick, and Samuel, the team behind SimpleCity"}
                className="aspect-[16/9] w-full object-cover object-[50%_65%]"
              />
            </div>
            <div>
              <h2 id="team-heading" className="text-xl font-black leading-snug text-ink">
                {locale === "es"
                  ? "Creado por tres estudiantes del Área de la Bahía"
                  : "Built by three Bay Area students"}
              </h2>
              <p className="mt-2 text-base leading-7 text-black/65">
                {locale === "es"
                  ? "Somos Ruiwen, Patrick y Samuel. Hicimos SimpleCity para que cualquiera pueda seguir lo que decide su gobierno local, sin tener que leer cientos de páginas de agenda."
                  : "We’re Ruiwen, Patrick, and Samuel. We built SimpleCity so anyone can keep up with local decisions without reading hundreds of pages of agendas."}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Link
                  href={locale === "es" ? "/about?lang=es" : "/about"}
                  className="inline-flex items-center gap-2 rounded-sm text-sm font-bold text-civic underline-offset-4 hover:underline focus-visible:focus-ring"
                >
                  {locale === "es" ? "Nuestra historia" : "Our story"}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
                <Link
                  href={locale === "es" ? "/about?lang=es#news" : "/about#news"}
                  className="inline-flex items-center gap-2 rounded-sm text-sm font-bold text-civic underline-offset-4 hover:underline focus-visible:focus-ring"
                >
                  {locale === "es" ? "SimpleCity en las noticias" : "SimpleCity in the news"}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
