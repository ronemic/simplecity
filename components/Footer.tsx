"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import {
  LOCALE_CHANGE_EVENT,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  type Locale,
  t
} from "@/lib/i18n";

const DONATION_URL = "https://hcb.hackclub.com/donations/start/simplecity";

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

function exploreLabel(locale: Locale) {
  return locale === "es" ? "Explorar" : "Explore";
}

function localizedHref(path: string, locale: Locale) {
  return `${path}?lang=${locale}`;
}

export function Footer({ locale = "en" }: { locale?: Locale }) {
  const [currentLocale, setCurrentLocale] = useState(locale);
  const pathname = usePathname();
  const showSupportCallout = pathname !== "/";

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

  return (
    <>
      {showSupportCallout ? (
        <section className="section-shell mt-6 pb-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-lg font-black text-ink">
                {currentLocale === "es"
                  ? "Ayuda a que SimpleCity siga siendo gratuito y continúe creciendo"
                  : "Help keep SimpleCity free and growing"}
              </h2>
              <p className="mt-1.5 text-[15px] font-medium leading-6 text-black/65">
                {currentLocale === "es"
                  ? "Tu apoyo nos ayuda a cubrir más comunidades y mantener resúmenes confiables con enlaces a fuentes. Las donaciones son deducibles de impuestos."
                  : "Your support helps us cover more communities and maintain reliable, source-linked summaries. Donations are tax-deductible."}
              </p>
            </div>
            <a
              href={DONATION_URL}
              target="_blank"
              rel="noreferrer"
              className="action-primary-sm w-fit shrink-0"
            >
              {currentLocale === "es" ? "Apoya a SimpleCity" : "Support SimpleCity"}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
          </div>
        </section>
      ) : null}

      <footer className={`${showSupportCallout ? "mt-0" : "mt-10"} border-t border-black/10 bg-[#eef3f6]`}>
      <div className="section-shell py-10 text-sm text-black/70">
        <div className="grid gap-10 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-10 lg:gap-16">
          <div className="max-w-sm">
            <Link
              href={localizedHref("/", currentLocale)}
              className="flex items-center gap-2.5 text-base font-black leading-none text-ink focus-visible:focus-ring"
            >
              <Image
                src="/favicon.svg"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-lg"
              />
              SimpleCity
            </Link>
            <p className="mt-3 leading-6">
              {footerDescription(currentLocale)}{" "}
              {currentLocale === "es"
                ? "SimpleCity cuenta con el patrocinio fiscal de Hack Club, una organización sin fines de lucro 501(c)(3)."
                : "SimpleCity is fiscally sponsored by Hack Club, a 501(c)(3) nonprofit."}
            </p>
          </div>

          <nav aria-label={exploreLabel(currentLocale)} className="min-w-[7rem]">
            <p className="label-eyebrow">{exploreLabel(currentLocale)}</p>
            <ul className="mt-3 flex flex-col gap-2.5 font-semibold text-ink/80">
              <li>
                <Link className="transition hover:text-civic" href={localizedHref("/decisions", currentLocale)}>
                  {t(currentLocale, "decisions")}
                </Link>
              </li>
              <li>
                <Link className="transition hover:text-civic" href={localizedHref("/meetings", currentLocale)}>
                  {t(currentLocale, "meetings")}
                </Link>
              </li>
              <li>
                <Link className="transition hover:text-civic" href={localizedHref("/topics", currentLocale)}>
                  {t(currentLocale, "topics")}
                </Link>
              </li>
              <li>
                <Link className="transition hover:text-civic" href={localizedHref("/subscribe", currentLocale)}>
                  {currentLocale === "es" ? "Suscribirse" : "Subscribe"}
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label={aboutLabel(currentLocale)} className="min-w-[7rem]">
            <p className="label-eyebrow">{aboutLabel(currentLocale)}</p>
            <ul className="mt-3 flex flex-col gap-2.5 font-semibold text-ink/80">
              <li>
                <Link className="transition hover:text-civic" href={localizedHref("/about", currentLocale)}>
                  {aboutLabel(currentLocale)}
                </Link>
              </li>
              <li>
                <a className="transition hover:text-civic" href="mailto:simplecityadmin@gmail.com">
                  {t(currentLocale, "contact")}
                </a>
              </li>
              <li>
                <a
                  className="font-bold text-civic transition hover:text-ink"
                  href={DONATION_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {currentLocale === "es" ? "Apoya a SimpleCity" : "Support SimpleCity"}
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-label={"Legal"} className="min-w-[7rem]">
            <p className="label-eyebrow">{"Legal"}</p>
            <ul className="mt-3 flex flex-col gap-2.5 font-semibold text-ink/80">
              <li>
                <Link className="transition hover:text-civic" href={localizedHref("/privacy", currentLocale)}>
                  {currentLocale === "es" ? "Privacidad" : "Privacy"}
                </Link>
              </li>
              <li>
                <Link className="transition hover:text-civic" href={localizedHref("/cookies", currentLocale)}>
                  {currentLocale === "es" ? "Configuración de cookies" : "Cookie settings"}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
      </footer>
    </>
  );
}
