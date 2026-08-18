import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import {
  getConfiguredAppUrl,
  getPublicAppUrlFromHeaders,
  isLocalAppUrl
} from "@/lib/appUrl";
import {
  ALL_JURISDICTIONS_SLUG,
  PUBLIC_JURISDICTION_OPTIONS,
  isSchoolDistrictJurisdiction
} from "@/lib/config/jurisdictions";
import { CATEGORIES, CATEGORY_DEFINITIONS, SCHOOL_CATEGORIES } from "@/lib/constants";

export const dynamic = "force-dynamic";

function jurisdictionUrl(appUrl: string, path: string, jurisdiction: string) {
  const url = new URL(path, appUrl);
  url.searchParams.set("jurisdiction", jurisdiction);
  return url.toString();
}

function addLanguageVariants(routes: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  return routes.flatMap((route) => {
    const defaultUrl = new URL(route.url);
    defaultUrl.searchParams.delete("lang");
    const englishUrl = new URL(defaultUrl);
    englishUrl.searchParams.set("lang", "en");
    const spanishUrl = new URL(defaultUrl);
    spanishUrl.searchParams.set("lang", "es");
    const languages = {
      "en-US": englishUrl.toString(),
      "es-US": spanishUrl.toString(),
      "x-default": defaultUrl.toString()
    };

    return [
      { ...route, url: englishUrl.toString(), alternates: { languages } },
      { ...route, url: spanishUrl.toString(), alternates: { languages } }
    ];
  });
}

export function buildSitemapEntries(appUrl: string): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: MetadataRoute.Sitemap = [
    { url: `${appUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${appUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${appUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${appUrl}/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${appUrl}/decisions`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${appUrl}/meetings`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${appUrl}/topics`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${appUrl}/subscribe`, lastModified: now, changeFrequency: "monthly", priority: 0.7 }
  ];

  for (const option of PUBLIC_JURISDICTION_OPTIONS) {
    if (option.slug === ALL_JURISDICTIONS_SLUG) continue;
    routes.push(
      {
        url: jurisdictionUrl(appUrl, "/decisions", option.slug),
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.8
      },
      {
        url: jurisdictionUrl(appUrl, "/meetings", option.slug),
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.8
      }
    );
  }

  for (const category of CATEGORIES) {
    const categoryPath = `/topics/${CATEGORY_DEFINITIONS[category].slug}`;
    routes.push({
      url: `${appUrl}${categoryPath}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8
    });

    for (const option of PUBLIC_JURISDICTION_OPTIONS) {
      if (option.slug === ALL_JURISDICTIONS_SLUG) continue;
      if (isSchoolDistrictJurisdiction(option.slug)) continue;
      routes.push({
        url: jurisdictionUrl(appUrl, categoryPath, option.slug),
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.7
      });
    }
  }

  for (const category of SCHOOL_CATEGORIES) {
    const categoryPath = `/topics/${CATEGORY_DEFINITIONS[category].slug}`;
    for (const option of PUBLIC_JURISDICTION_OPTIONS) {
      if (!isSchoolDistrictJurisdiction(option.slug)) continue;
      routes.push({
        url: jurisdictionUrl(appUrl, categoryPath, option.slug),
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.7
      });
    }
  }

  return addLanguageVariants(routes);
}

async function sitemapAppUrl() {
  const configured = getConfiguredAppUrl();
  // A deployed origin is authoritative, so skip the headers entirely: trusting
  // them here would let any visitor publish a sitemap pointing at their own
  // domain just by sending a forged Host.
  if (!isLocalAppUrl(configured)) return configured;

  try {
    const headersList = await headers();
    return getPublicAppUrlFromHeaders((name) => headersList.get(name), configured);
  } catch {
    // Static builds do not provide request headers.
    return configured;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries(await sitemapAppUrl());
}
