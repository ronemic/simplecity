import { getConfiguredAppUrl } from "@/lib/appUrl";
import type { Locale } from "@/lib/i18n";

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function seoLocale(value: string | undefined | null): Locale {
  return value === "es" ? "es" : "en";
}

export function localizedSeoUrls(pathOrUrl: string | URL, locale: Locale) {
  const defaultUrl = new URL(pathOrUrl.toString(), getConfiguredAppUrl());
  defaultUrl.searchParams.delete("lang");

  const spanishUrl = new URL(defaultUrl);
  spanishUrl.searchParams.set("lang", "es");

  // English is the default language, so its canonical is the bare URL rather
  // than ?lang=en. A canonical that points at a *different* URL listed in this
  // page's own hreflang set is self-contradictory -- it tells crawlers to index
  // a duplicate of the page they just fetched -- and Lighthouse flags it.
  return {
    canonical: (locale === "es" ? spanishUrl : defaultUrl).toString(),
    languages: {
      "en-US": defaultUrl.toString(),
      "es-US": spanishUrl.toString(),
      "x-default": defaultUrl.toString()
    }
  };
}
