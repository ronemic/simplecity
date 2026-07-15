import type { MetadataRoute } from "next";
import { getConfiguredAppUrl } from "@/lib/appUrl";

export default function robots(): MetadataRoute.Robots {
  const appUrl = getConfiguredAppUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/offline"]
    },
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl
  };
}
