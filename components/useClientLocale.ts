"use client";

import { useEffect, useState } from "react";
import {
  LOCALE_CHANGE_EVENT,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  type Locale
} from "@/lib/i18n";

function readCookieLocale() {
  const localeCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];

  return normalizeLocale(localeCookie ? decodeURIComponent(localeCookie) : null);
}

// The root layout is not re-rendered when the language changes, so anything
// it renders outside the page (support callout, footer) gets a stale server
// locale. This follows the header's locale change event instead.
export function useClientLocale(initialLocale: Locale) {
  const [currentLocale, setCurrentLocale] = useState(initialLocale);

  useEffect(() => {
    function syncLocale(nextLocale?: string | null) {
      const normalized = normalizeLocale(nextLocale || readCookieLocale());
      setCurrentLocale(normalized);
      document.documentElement.lang = normalized;
    }

    try {
      syncLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
    } catch {
      syncLocale();
    }

    function handleLocaleChange(event: Event) {
      syncLocale((event as CustomEvent<{ locale?: string }>).detail?.locale);
    }

    function handlePopState() {
      const lang = new URL(window.location.href).searchParams.get("lang");
      syncLocale(lang);
    }

    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return currentLocale;
}
