import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "lucide-react";
import { CATEGORY_DEFINITIONS, CATEGORIES, SCHOOL_CATEGORIES } from "@/lib/constants";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  isSchoolDistrictJurisdiction,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { categoryDescription, categoryLabel, t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const locale = seoLocale((await searchParams).lang);
  const title = locale === "es" ? "Temas del gobierno local | SimpleCity" : "Local government topics | SimpleCity";
  const description =
    locale === "es"
      ? "Explora decisiones locales sobre vivienda, transporte, seguridad pública, parques, presupuestos, desarrollo, escuelas y servicios municipales."
      : "Explore local decisions about housing, transportation, public safety, parks, budgets, development, schools, and city services.";
  const urls = localizedSeoUrls("/topics", locale);

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages },
    openGraph: { title, description, type: "website", url: urls.canonical, siteName: "SimpleCity" },
    twitter: { card: "summary", title, description }
  };
}

export default async function TopicsPage({
  searchParams
}: {
  searchParams: Promise<{ jurisdiction?: string; lang?: string }>;
}) {
  const [query, locale, cookieStore] = await Promise.all([
    searchParams,
    getRequestLocale(),
    cookies()
  ]);
  const jurisdiction = normalizeJurisdictionSelection(
    query.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const categories = isSchoolDistrictJurisdiction(jurisdiction)
    ? SCHOOL_CATEGORIES
    : CATEGORIES;
  const publicJurisdiction = toPublicJurisdictionSlug(jurisdiction);

  return (
    <div className="section-shell py-10">
      <div className="mb-8 max-w-3xl">
        <p className="label-eyebrow text-civic">{t(locale, "topics")}</p>
        <h1 className="page-title mt-2">{t(locale, "everydayImpactTitle")}</h1>
        <p className="page-copy mt-3 text-base">
          {locale === "es"
            ? "SimpleCity etiqueta los puntos de la agenda según las partes de la vida diaria que probablemente afecten."
            : "SimpleCity tags agenda items by the parts of daily life they are most likely to affect."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => {
          const definition = CATEGORY_DEFINITIONS[category];
          const Icon = definition.icon;
          return (
            <Link
              key={category}
              href={`/topics/${definition.slug}?${new URLSearchParams({
                jurisdiction: publicJurisdiction,
                ...(query.lang ? { lang: query.lang } : {})
              }).toString()}`}
              className="quiet-card topic-card group flex h-full flex-col p-5 focus-visible:focus-ring"
            >
              <span className="icon-tile transition-colors duration-150 group-hover:bg-[#e6f0ff] group-hover:text-civic">
                <Icon aria-hidden className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-xl font-bold text-ink">{categoryLabel(locale, category)}</h2>
              <p className="mt-2 text-sm leading-6 text-black/70">{categoryDescription(locale, category)}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold text-civic">
                {t(locale, "viewCards")} <ArrowRight aria-hidden className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
