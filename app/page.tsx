import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Landmark, Users } from "lucide-react";
import { cookies } from "next/headers";
import { cache, Suspense } from "react";
import {
  HomepageContentLoading,
  HomepageContentUnavailable,
  HomepageDataContent,
  HomepageHeroStatus,
  HomepageHeroStatusLoading
} from "@/components/HomepageData";
import { SearchAndFilters } from "@/components/SearchAndFilters";
import { CATEGORIES, CATEGORY_DEFINITIONS, SCHOOL_CATEGORIES } from "@/lib/constants";
import { getHomepageContent, type HomepageCardSelection } from "@/lib/db/queries";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictions,
  getJurisdictionLabel,
  isSchoolDistrictJurisdiction,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import { categoryShortLabel, t, type Locale } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";

const FEATURE_ARTICLE_URL =
  "https://www.losaltosonline.com/news/using-ai-students-create-website-that-summarizes-local-government-agendas/article_63d31ed4-6317-434e-a77b-1c8f38d5d1a6.html";
// Manually maintained from analytics. Last checked 2026-08-21; update the date
// when you revise the figure so it is obvious when it has gone stale.
const APPROX_USER_COUNT = "500+";
const APPROX_AGENDA_ITEMS_ANALYZED = "7800+";

// Rounds down to a round hundred and adds "+" once there is a hundred to show;
// below that the exact count is honest and "0+" is never rendered. Returns null
// for a stat with nothing worth stating -- null count (read failed) or zero.
function statValue(count: number | null, locale: string) {
  if (count === null || count <= 0) {
    return null;
  }

  const formatter = new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US");

  if (count >= 100) {
    return `${formatter.format(Math.floor(count / 100) * 100)}+`;
  }

  return formatter.format(count);
}

export const revalidate = 300;

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const locale = seoLocale((await searchParams).lang);
  const title =
    locale === "es"
      ? "SimpleCity | Decisiones locales fáciles de entender"
      : "SimpleCity | Easy-to-understand local decisions";
  const description =
    locale === "es"
      ? "Encuentra próximas decisiones del gobierno local, reuniones públicas, fuentes oficiales y formas de participar en comunidades del Área de la Bahía."
      : "Find upcoming local government decisions, public meetings, official sources, and ways to participate across Bay Area communities.";
  const urls = localizedSeoUrls("/", locale);

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages },
    openGraph: { title, description, type: "website", url: urls.canonical, siteName: "SimpleCity" },
    twitter: { card: "summary", title, description }
  };
}

function GlanceStats({ locale }: { locale: Locale }) {
  // A stat with no value is one whose read failed or whose count is zero; drop it
  // rather than advertise it. Jurisdiction coverage plus the maintained user and
  // agenda-item counts are always present.
  const glanceStats = [
    {
      icon: Users,
      value: APPROX_USER_COUNT,
      label: locale === "es" ? "usuarios" : "users"
    },
    {
      icon: Landmark,
      value: statValue(getJurisdictions().length, locale),
      label: locale === "es" ? "jurisdicciones" : "jurisdictions"
    },
    {
      icon: FileText,
      value: APPROX_AGENDA_ITEMS_ANALYZED,
      label: locale === "es" ? "puntos de agenda analizados" : "agenda items analyzed"
    }
  ].filter((item): item is { icon: typeof Users; value: string; label: string } => item.value !== null);

  if (glanceStats.length === 0) return null;

  return (
    <div className="py-1 lg:-translate-y-4">
      <p className="mb-3 text-xs font-black uppercase tracking-wide text-[#9fc4f4]">
        {locale === "es" ? "SimpleCity de un vistazo" : "SimpleCity at a glance"}
      </p>
      <div
        className={`grid divide-x divide-white/15 ${
          glanceStats.length === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"
        }`}
      >
        {glanceStats.map((item) => (
          <div key={item.label} className="flex min-w-0 items-center gap-2 px-3 first:pl-0 last:pr-0 sm:px-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#182c45] sm:h-10 sm:w-10">
              <item.icon aria-hidden className="h-4 w-4 text-[#9fc4f4] sm:h-5 sm:w-5" />
            </span>
            <p className="min-w-0 leading-tight">
              <span className="block text-lg font-black text-white sm:text-xl">{item.value}</span>
              <span className="block text-[11px] font-semibold text-[#d9e2ec] sm:text-xs">
                {item.label}
              </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Holds the strip's height while the counts resolve, so the hero does not jump. */
function GlanceStatsLoading({ locale }: { locale: Locale }) {
  return (
    <div
      className="py-1 lg:-translate-y-4"
      aria-busy="true"
      aria-label={locale === "es" ? "Cargando estadísticas" : "Loading statistics"}
    >
      <p className="mb-3 text-xs font-black uppercase tracking-wide text-[#9fc4f4]">
        {locale === "es" ? "SimpleCity de un vistazo" : "SimpleCity at a glance"}
      </p>
      <div className="grid grid-cols-2 divide-x divide-white/15 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex min-w-0 items-center gap-2 px-3 first:pl-0 last:pr-0 sm:px-4">
            <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[#182c45] sm:h-10 sm:w-10" />
            <p className="min-w-0 flex-1 leading-tight">
              <span className="block h-6 w-14 animate-pulse rounded bg-white/15 sm:h-7" />
              <span className="mt-1 block h-3 w-16 animate-pulse rounded bg-white/10" />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Deduped per request so the hero status line and the decisions section can sit
 * in separate Suspense boundaries -- streaming independently -- while sharing a
 * single read. `cache` keys on argument identity, so the arguments stay
 * primitives rather than the options object the query itself takes.
 */
const homepageContent = cache(
  (jurisdiction: JurisdictionSelection, locale: Locale, search: string) =>
    getHomepageContent({ jurisdiction, locale, search })
);

async function HeroStatus({
  jurisdiction,
  locale,
  search
}: {
  jurisdiction: JurisdictionSelection;
  locale: Locale;
  search: string;
}) {
  let totalCount: number | null = null;
  try {
    ({ totalCount } = await homepageContent(jurisdiction, locale, search));
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
  search
}: {
  hasSearch: boolean;
  jurisdiction: JurisdictionSelection;
  jurisdictionLabel: string;
  locale: Locale;
  search: string;
}) {
  let content: HomepageCardSelection | null = null;
  try {
    content = await homepageContent(jurisdiction, locale, search);
  } catch (error) {
    console.error("Failed to load homepage decisions", error);
  }

  if (!content) return <HomepageContentUnavailable locale={locale} />;

  return (
    <HomepageDataContent
      content={content}
      hasSearch={hasSearch}
      jurisdictionLabel={jurisdictionLabel}
      locale={locale}
      search={search}
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
  }>;
}) {
  const [params, locale, cookieStore] = await Promise.all([
    searchParams,
    getRequestLocale(),
    cookies()
  ]);
  const search = (params.q || "").trim();
  const jurisdiction = normalizeJurisdictionSelection(
    params.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction, locale);
  const topicCategories = isSchoolDistrictJurisdiction(jurisdiction)
    ? SCHOOL_CATEGORIES
    : CATEGORIES;
  const hasSearch = search.length > 0;
  const introLabel =
    jurisdiction === "all"
      ? locale === "es"
        ? "Reuniones públicas de varias jurisdicciones"
        : "Public meetings across jurisdictions"
      : locale === "es"
        ? `Reuniones públicas de ${jurisdictionLabel}`
        : `${jurisdictionLabel} public meetings`;

  return (
    <div className="overflow-hidden">
      <section className="civic-hero">
        <div
          className={`section-shell relative z-10 grid gap-7 ${
            hasSearch ? "py-7 sm:py-8" : "py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-end lg:py-14"
          }`}
        >
          <div className="max-w-2xl">
            {!hasSearch ? (
              <a
                href={FEATURE_ARTICLE_URL}
                target="_blank"
                rel="noreferrer"
                className="group mb-6 inline-flex max-w-full items-center gap-2 rounded-sm text-sm font-semibold text-[#d9e2ec] underline decoration-white/25 underline-offset-4 transition hover:text-white hover:decoration-white/60 focus-visible:focus-ring"
              >
                <span>
                  {locale === "es"
                    ? "Lee sobre SimpleCity en Los Altos Town Crier"
                    : "Read about SimpleCity in the Los Altos Town Crier"}
                </span>
                <ArrowRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-[#9fc4f4] transition-transform group-hover:translate-x-0.5"
                />
              </a>
            ) : null}
            <p className="text-sm font-black uppercase text-[#9fc4f4]">
              {introLabel}
            </p>
            <h1 className="mt-4 text-balance text-[36px] font-black leading-[1.02] text-[#fffaf0] sm:text-[52px] lg:text-[56px]">
              {locale === "es"
                ? "Mira qué está decidiendo tu gobierno local."
                : "See what your local government is deciding."}
            </h1>
            <p className="mt-4 max-w-2xl text-balance text-base font-medium leading-7 text-[#d9e2ec] sm:mt-5 sm:text-xl sm:leading-8">
              {locale === "es"
                ? "Lee resúmenes en lenguaje claro, revisa próximas reuniones y votaciones, y encuentra formas de compartir tu opinión."
                : "Get easy-to-understand, source-linked summaries, check upcoming meetings and votes, and find ways to share your input."}
            </p>
            <Suspense fallback={<HomepageHeroStatusLoading />}>
              <HeroStatus jurisdiction={jurisdiction} locale={locale} search={search} />
            </Suspense>
          </div>

          <div className="space-y-5 lg:justify-self-stretch">
            {!hasSearch ? (
              <Suspense fallback={<GlanceStatsLoading locale={locale} />}>
                <GlanceStats locale={locale} />
              </Suspense>
            ) : null}

            <div>
              <p className="mb-4 text-xs font-black uppercase tracking-wide text-[#9fc4f4]">
                {locale === "es" ? "Buscar resúmenes oficiales" : "Search official summaries"}
              </p>
              <SearchAndFilters
                action={`/decisions?jurisdiction=${toPublicJurisdictionSlug(jurisdiction)}`}
                search={search}
                locale={locale}
              />
            </div>
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
        />
      </Suspense>
      <section className="section-shell pb-16 pt-8">
        <div className="mb-5 max-w-2xl">
          <p className="label-eyebrow text-civic">{t(locale, "browseByTopic")}</p>
          <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">{t(locale, "everydayImpactTitle")}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topicCategories.map((category) => {
            const definition = CATEGORY_DEFINITIONS[category];
            const Icon = definition.icon;
            return (
              <Link
                key={category}
                href={`/topics/${definition.slug}?${new URLSearchParams({
                  jurisdiction: toPublicJurisdictionSlug(jurisdiction),
                  ...(params.lang ? { lang: params.lang } : {})
                }).toString()}`}
                className="quiet-card topic-card group grid min-h-[88px] grid-cols-[2.75rem_1fr] items-center gap-3 px-4 py-4 focus-visible:focus-ring"
              >
                <span className="icon-tile transition-colors duration-150 group-hover:bg-[#e6f0ff] group-hover:text-civic">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="text-base font-black leading-5 text-ink">
                  {categoryShortLabel(locale, category)}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
