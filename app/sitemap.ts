import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getConfiguredAppUrl, isLocalAppUrl, normalizeAppUrl } from "@/lib/appUrl";
import {
  ALL_JURISDICTIONS_SLUG,
  PUBLIC_JURISDICTION_OPTIONS
} from "@/lib/config/jurisdictions";
import { CATEGORIES, CATEGORY_DEFINITIONS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function jurisdictionUrl(appUrl: string, path: string, jurisdiction: string) {
  const url = new URL(path, appUrl);
  url.searchParams.set("jurisdiction", jurisdiction);
  return url.toString();
}

export function buildSitemapEntries(appUrl: string): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: MetadataRoute.Sitemap = [
    { url: `${appUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${appUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${appUrl}/decisions`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${appUrl}/meetings`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${appUrl}/topics`, lastModified: now, changeFrequency: "weekly", priority: 0.8 }
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
      routes.push({
        url: jurisdictionUrl(appUrl, categoryPath, option.slug),
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.7
      });
    }
  }

  return routes;
}

async function sitemapAppUrl() {
  try {
    const headersList = await headers();
    const host = headersList.get("x-forwarded-host") || headersList.get("host");
    if (host) {
      const proto =
        headersList.get("x-forwarded-proto") ||
        (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
      const requestAppUrl = normalizeAppUrl(`${proto}://${host}`);
      if (!isLocalAppUrl(requestAppUrl)) return requestAppUrl;
    }
  } catch {
    // Static builds do not provide request headers.
  }

  return getConfiguredAppUrl();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries(await sitemapAppUrl());
}
