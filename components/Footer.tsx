"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LOCALE_COOKIE, normalizeLocale, type Locale, t } from "@/lib/i18n";

const LOCALE_STORAGE_KEY = "simplecity.locale";

function readCookieLocale() {
  const localeCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];

  return normalizeLocale(localeCookie ? decodeURIComponent(localeCookie) : null);
}

function footerDescription(locale: Locale) {
  return locale === "es"
    ? "SimpleCity es un sitio independiente compilado por ciudadanos privados, no un sitio oficial de la ciudad. Resume documentos de reuniones públicas para que sean más fáciles de entender. Siempre revisa la fuente original antes de tomar decisiones formales."
    : "SimpleCity is an independent site compiled by private citizens, not an official City website. It summarizes public meeting documents to make them easier to understand. Always review the original source before making formal decisions.";
}

function aboutSourcesLabel(locale: Locale) {
  return locale === "es" ? "Acerca de y fuentes" : "About & sources";
}

export function Footer({ locale = "en" }: { locale?: Locale }) {
  const [currentLocale, setCurrentLocale] = useState(locale);

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

    window.addEventListener("simplecity:localechange", handleLocaleChange);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("simplecity:localechange", handleLocaleChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return (
    <footer className="mt-10 border-t border-black/10 bg-[#eef3f6]">
      <div className="section-shell grid gap-6 py-8 text-sm text-black/70 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="max-w-3xl">
          <p className="text-base font-black text-ink">SimpleCity</p>
          <p className="mt-3 max-w-2xl leading-6">{footerDescription(currentLocale)}</p>
        </div>

        <nav
          aria-label={currentLocale === "es" ? "Enlaces del pie de página" : "Footer links"}
          className="flex flex-wrap gap-2 font-bold md:justify-end"
        >
          <Link className="action-ghost" href="/about">
            {aboutSourcesLabel(currentLocale)}
          </Link>
          <a className="action-ghost" href="mailto:simplecityadmin@gmail.com">
            {t(currentLocale, "contact")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
