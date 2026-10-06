import { cache } from "react";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALES, normalizeLocale, type Locale } from "@/lib/i18n";

export const getRequestLocale = cache(async function getRequestLocale() {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
});

/**
 * Language for page text, including titles and descriptions in generateMetadata.
 * An explicit `?lang=` wins -- it is what crawlers and hreflang links use -- and
 * otherwise the reader's saved locale cookie, so Spanish readers keep Spanish
 * titles after the first click.
 * Canonical/alternate URLs should still come from `seoLocale(lang)` alone.
 */
export async function getPageLocale(lang: string | undefined | null): Promise<Locale> {
  return LOCALES.includes(lang as Locale) ? (lang as Locale) : getRequestLocale();
}
