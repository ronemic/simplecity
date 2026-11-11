"use client";

import { Languages, Vote } from "lucide-react";
import Link from "@/components/SiteNavigation";
import { useSitePathname as usePathname } from "@/components/SiteNavigation";
import { t, type Locale } from "@/lib/i18n";

export function PreviewBrand() {
  return <Link href="/" className="redesign-brand"><span><Vote size={15} aria-hidden /></span>SimpleCity</Link>;
}

export function PreviewHeader({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const links = ["decisions", "meetings", "topics", "following", "about"] as const;

  function switchLanguage(language: Locale) {
    if (locale === language) return;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", language);
    window.location.assign(url);
  }

  return (
    <header className="redesign-header">
      <div className="redesign-shell redesign-header-inner">
        <PreviewBrand />
        <nav aria-label={locale === "es" ? "Principal" : "Main"}>
          {links.map((key) => {
            const href = `/${key}`;
            return <Link key={key} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}>{t(locale, key)}</Link>;
          })}
        </nav>
        <div className="redesign-header-actions">
          <div className="redesign-language" role="group" aria-label={locale === "es" ? "Idioma" : "Language"}>
            <Languages size={16} aria-hidden />
            {(["en", "es"] as const).map((language) => (
              <button key={language} type="button" lang={language} aria-pressed={locale === language} onClick={() => switchLanguage(language)}>{language.toUpperCase()}</button>
            ))}
          </div>
          <Link className="redesign-button" href="/subscribe" aria-current={pathname === "/subscribe" ? "page" : undefined}>{t(locale, "subscribe")}</Link>
        </div>
      </div>
    </header>
  );
}
