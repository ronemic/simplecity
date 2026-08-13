"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LOCALE_CHANGE_EVENT,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  type Locale,
  t
} from "@/lib/i18n";

function readCookieLocale() {
  const localeCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];

  return normalizeLocale(localeCookie ? decodeURIComponent(localeCookie) : null);
}

function footerDescription(locale: Locale) {
  return locale === "es"
    ? "SimpleCity es una plataforma independiente dirigida por estudiantes, no un sitio web oficial del gobierno local. Resume documentos de reuniones públicas para que sean más fáciles de entender. Siempre revisa la fuente original antes de tomar decisiones formales."
    : "SimpleCity is an independent, student-led platform, not an official local government website. It summarizes public meeting documents to make them easier to understand. Always review the original source before making formal decisions.";
}

function aboutLabel(locale: Locale) {
  return locale === "es" ? "Acerca de" : "About";
}

function localizedHref(path: string, locale: Locale) {
  return `${path}?lang=${locale}`;
}

const FOOTER_LINK_CLASS =
  "text-[13.5px] font-medium text-slate underline decoration-transparent underline-offset-4 transition-colors hover:text-brand hover:decoration-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

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

    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const links = [
    { href: localizedHref("/about", currentLocale), label: aboutLabel(currentLocale) },
    {
      href: localizedHref("/subscribe", currentLocale),
      label: currentLocale === "es" ? "Suscribirse" : "Subscribe"
    },
    {
      href: localizedHref("/privacy", currentLocale),
      label: currentLocale === "es" ? "Privacidad" : "Privacy"
    },
    {
      href: localizedHref("/cookies", currentLocale),
      label: currentLocale === "es" ? "Configuración de cookies" : "Cookie settings"
    }
  ];

  return (
    <footer className="mt-4 border-t border-rule bg-band">
      <div className="section-shell grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-12">
        <div>
          <div className="flex items-center gap-2.5">
            <Image
              src="/favicon.svg"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 shrink-0 rounded"
            />
            <p className="text-[15px] font-semibold tracking-tight text-ink">SimpleCity</p>
          </div>
          {/* Held to a readable measure — it ran the full page width before. */}
          <p className="mt-3 max-w-[58ch] text-[13px] leading-6 text-quiet">
            {footerDescription(currentLocale)}
          </p>
        </div>

        {/* A column on desktop rather than a wrapping row of ghost buttons, which
            read as loosely scattered chips. */}
        <nav
          aria-label={currentLocale === "es" ? "Enlaces del pie de página" : "Footer links"}
          className="grid grid-cols-2 gap-x-6 gap-y-2.5 md:flex md:flex-col md:items-end md:gap-y-2"
        >
          {links.map((link) => (
            <Link key={link.href} className={FOOTER_LINK_CLASS} href={link.href}>
              {link.label}
            </Link>
          ))}
          <a className={FOOTER_LINK_CLASS} href="mailto:simplecityadmin@gmail.com">
            {t(currentLocale, "contact")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
