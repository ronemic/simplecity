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

  const englishUrl = new URL(defaultUrl);
  englishUrl.searchParams.set("lang", "en");
  const spanishUrl = new URL(defaultUrl);
  spanishUrl.searchParams.set("lang", "es");

  return {
    canonical: (locale === "es" ? spanishUrl : englishUrl).toString(),
    languages: {
      "en-US": englishUrl.toString(),
      "es-US": spanishUrl.toString(),
      "x-default": defaultUrl.toString()
    }
  };
}
