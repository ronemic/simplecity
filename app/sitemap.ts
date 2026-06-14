import { getPublicJurisdictionOptions } from "@/lib/config/jurisdictions";
import { MetadataRoute } from "next";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let appUrl: string | undefined;

  try {
    const headersList = await headers();
    const host = headersList.get("x-forwarded-host") || headersList.get("host");
    if (host) {
      const proto = headersList.get("x-forwarded-proto") || (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
      appUrl = `${proto}://${host}`;
    }
  } catch {
    // Fallback if headers() is called outside of request context (e.g. static build or tests)
  }

  if (!appUrl) {
    appUrl = process.env.NEXT_PUBLIC_APP_URL;
  }

  // Final fallback
  if (!appUrl) {
    appUrl = "http://localhost:3000";
  }
  const jurisdictions = getPublicJurisdictionOptions().map((opt) => opt.slug);

  const routes: MetadataRoute.Sitemap = [];

  // 1. Core static pages (default jurisdiction/all)
  routes.push(
    {
      url: `${appUrl}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${appUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${appUrl}/decisions`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${appUrl}/meetings`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${appUrl}/categories`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    }
  );

  // 2. Core pages with jurisdiction parameters
  for (const j of jurisdictions) {
    if (j === "all") continue; // Default behaves like all or default selection
    routes.push(
      {
        url: `${appUrl}/?jurisdiction=${j}`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.9,
      },
      {
        url: `${appUrl}/decisions?jurisdiction=${j}`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.8,
      },
      {
        url: `${appUrl}/meetings?jurisdiction=${j}`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.8,
      },
      {
        url: `${appUrl}/categories?jurisdiction=${j}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      }
    );
  }

  return routes;
}
