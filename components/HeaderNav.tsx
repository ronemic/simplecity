"use client";

import { Bell, Check, ChevronDown, Languages, Loader2, MapPin, Menu, School, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionDisplayLabel,
  getPublicJurisdictionOptions
} from "@/lib/config/jurisdictions";
import {
  LANGUAGE_OPTIONS,
  LOCALE_CHANGE_EVENT,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  type Locale,
  t
} from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

const nav = [
  { href: "/decisions", labelKey: "decisions" },
  { href: "/meetings", labelKey: "meetings" },
  { href: "/topics", labelKey: "topics" },
  // Six text links overflow the desktop header below xl, so this one is
  // icon-only from 800px (with a narrower location picker at lg) and hidden
  // in the 768-799px sliver where even the icon doesn't fit. The mobile menu
  // always shows the full label.
  { href: "/following", labelKey: "following", compactIcon: Bell },
  { href: "/about", labelKey: "about" },
  // Rendered as the header's call-to-action button on desktop.
  { href: "/subscribe", labelKey: "subscribe", isCta: true }
] as const;

// Desktop layout: the location and language pickers sit together beside the
// logo, and the page links plus the Subscribe button are pushed right. Mobile
// keeps the stacked menu, so these are all md: overrides.
const desktopPickerTrigger =
  "md:min-h-10 md:w-auto md:max-w-full md:bg-white";
const desktopCta =
  "md:ml-1 md:min-h-10 md:rounded-lg md:bg-civic md:px-3.5 md:font-bold md:text-white md:shadow-sm md:after:hidden md:hover:bg-[#1d4d92] md:hover:text-white lg:px-3.5";

function navItemClasses(item: (typeof nav)[number], isFirstLink: boolean) {
  return cn(
    "isCta" in item ? cn("md:order-3", desktopCta) : "md:order-2",
    isFirstLink && "md:ml-auto",
    "compactIcon" in item && "md:max-[799px]:hidden"
  );
}

const jurisdictions = getPublicJurisdictionOptions().map((jurisdiction) => ({
  slug: jurisdiction.slug,
  label: jurisdiction.name,
  isChild: Boolean(jurisdiction.parentCountySlug),
  isSchoolDistrict: jurisdiction.kind === "school-district"
}));

const JURISDICTION_STORAGE_KEY = "simplecity.jurisdiction";

function normalizeJurisdiction(value: string | null | undefined): string {
  if (value === "san-mateo-city") return "san-mateo";
  if (jurisdictions.some((jurisdiction) => jurisdiction.slug === value)) {
    return value || "san-mateo";
  }
  return "san-mateo";
}

function writeJurisdictionPreference(value: string) {
  const encoded = encodeURIComponent(value);
  document.cookie = `${JURISDICTION_PREFERENCE_COOKIE}=${encoded}; path=/; max-age=31536000; samesite=lax`;
}

function writeLocalePreference(value: Locale) {
  const encoded = encodeURIComponent(value);
  document.cookie = `${LOCALE_COOKIE}=${encoded}; path=/; max-age=31536000; samesite=lax`;
}

function announceLocalePreference(value: Locale) {
  document.documentElement.lang = value;
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: { locale: value } }));
}

function jurisdictionLabel(jurisdiction: (typeof jurisdictions)[number], locale: Locale) {
  return getJurisdictionDisplayLabel(jurisdiction.slug, locale);
}

function isActiveNavItem(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HeaderNav({
  initialJurisdiction = "san-mateo",
  locale = "en"
}: {
  initialJurisdiction?: string;
  locale?: Locale;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeJurisdiction = searchParams.get("jurisdiction");
  const [storedJurisdiction, setStoredJurisdiction] = useState(() =>
    normalizeJurisdiction(initialJurisdiction)
  );
  const routeSelectedJurisdiction = normalizeJurisdiction(
    routeJurisdiction || storedJurisdiction || initialJurisdiction
  );
  const [isJurisdictionMenuOpen, setIsJurisdictionMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [optimisticJurisdiction, setOptimisticJurisdiction] = useState(routeSelectedJurisdiction);
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
  const [isPending, startTransition] = useTransition();
  const [pendingSelector, setPendingSelector] = useState<"jurisdiction" | "language" | null>(null);
  const jurisdictionMenuRef = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const isJurisdictionPending = isPending && pendingSelector === "jurisdiction";
  const isLanguagePending = isPending && pendingSelector === "language";
  const selected = isJurisdictionPending ? optimisticJurisdiction : routeSelectedJurisdiction;
  const selectedJurisdiction =
    jurisdictions.find((jurisdiction) => jurisdiction.slug === selected) ||
    jurisdictions.find((jurisdiction) => jurisdiction.slug === "san-mateo")!;
  const selectedLanguage =
    LANGUAGE_OPTIONS.find((option) => option.locale === selectedLocale) || LANGUAGE_OPTIONS[0];

  useEffect(() => {
    if (!isJurisdictionMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!jurisdictionMenuRef.current?.contains(event.target as Node)) {
        setIsJurisdictionMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsJurisdictionMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isJurisdictionMenuOpen]);

  useEffect(() => {
    if (!isLanguageMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLanguageMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLanguageMenuOpen]);

  function hrefWithJurisdiction(href: string) {
    const params = new URLSearchParams();
    if (href === "/decisions" || href === "/meetings" || href === "/topics") {
      params.set("jurisdiction", selected);
    }
    const lang = searchParams.get("lang");
    if (lang) params.set("lang", lang);
    const query = params.toString();
    return `${href}${query ? `?${query}` : ""}`;
  }

  function hrefWithSelection(key: "jurisdiction" | "lang", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    if (key === "jurisdiction") params.delete("page");
    const query = params.toString();
    const nextPathname =
      key === "jurisdiction" && /^\/meetings\/[^/]+/.test(pathname)
        ? "/meetings"
        : pathname;

    return `${nextPathname}${query ? `?${query}` : ""}`;
  }

  function changeJurisdiction(value: string) {
    setIsJurisdictionMenuOpen(false);
    setIsMobileMenuOpen(false);
    setOptimisticJurisdiction(value);
    setStoredJurisdiction(value);
    setPendingSelector("jurisdiction");
    try {
      window.localStorage.setItem(JURISDICTION_STORAGE_KEY, value);
      writeJurisdictionPreference(value);
    } catch {
      // Ignore storage failures so the selector still works normally.
    }
    startTransition(() => {
      router.push(hrefWithSelection("jurisdiction", value), { scroll: false });
    });
  }

  function changeLanguage(value: Locale) {
    setIsLanguageMenuOpen(false);
    setIsMobileMenuOpen(false);
    setSelectedLocale(value);
    setPendingSelector("language");
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, value);
      writeLocalePreference(value);
    } catch {
      // Ignore storage failures so the selector still works normally.
    }
    announceLocalePreference(value);
    startTransition(() => {
      router.push(hrefWithSelection("lang", value), { scroll: false });
    });
  }

  return (
    <nav
      aria-label={t(selectedLocale, "primaryNavigation")}
      className="contents text-sm font-semibold text-ink md:flex md:min-w-0 md:flex-1"
    >
      <button
        aria-controls="mobile-primary-navigation"
        aria-expanded={isMobileMenuOpen}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-black/15 bg-white px-3 py-2 font-bold shadow-sm transition hover:border-civic/30 focus-visible:focus-ring md:hidden"
        onClick={() => {
          setIsMobileMenuOpen((isOpen) => !isOpen);
          setIsJurisdictionMenuOpen(false);
          setIsLanguageMenuOpen(false);
        }}
        type="button"
      >
        <span aria-hidden className="relative h-4 w-4 text-civic">
          <Menu
            className={`absolute inset-0 h-4 w-4 transition duration-200 ${
              isMobileMenuOpen ? "rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"
            }`}
          />
          <X
            className={`absolute inset-0 h-4 w-4 transition duration-200 ${
              isMobileMenuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0"
            }`}
          />
        </span>
        {t(selectedLocale, "menu")}
      </button>

      <div
        className={`${
          isMobileMenuOpen
            ? `visible mt-3 max-h-52 translate-y-0 opacity-100 ${
                isJurisdictionMenuOpen || isLanguageMenuOpen
                  ? "overflow-visible"
                  : "overflow-hidden"
              }`
            : "pointer-events-none invisible mt-0 max-h-0 -translate-y-2 overflow-hidden opacity-0"
        } col-span-2 grid min-h-0 w-full grid-cols-5 items-center gap-1 transition-[max-height,margin,opacity,transform,visibility] duration-200 ease-out md:pointer-events-auto md:visible md:mt-0 md:flex md:max-h-none md:min-w-0 md:flex-1 md:translate-y-0 md:items-center md:gap-1 md:overflow-visible md:opacity-100`}
        id="mobile-primary-navigation"
      >
      <div ref={jurisdictionMenuRef} className="relative col-span-5 md:order-1 md:ml-2 md:min-w-0 md:max-w-[11rem] lg:ml-4 lg:max-w-[15rem]">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isJurisdictionMenuOpen}
          aria-busy={isJurisdictionPending}
          className={cn("menu-trigger", desktopPickerTrigger)}
          onClick={() => setIsJurisdictionMenuOpen((isOpen) => !isOpen)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedJurisdiction.isSchoolDistrict ? (
              <School aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
            ) : (
              <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
            )}
            <span
              className="truncate"
            >
              {jurisdictionLabel(selectedJurisdiction, selectedLocale)}
            </span>
          </span>
          {isJurisdictionPending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-civic" />
          ) : (
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-black/60 transition ${
                isJurisdictionMenuOpen ? "rotate-180" : ""
              }`}
            />
          )}
        </button>
        {isJurisdictionMenuOpen ? (
          <div className="menu-popover md:w-60">
            <div role="listbox" aria-label={t(selectedLocale, "jurisdiction")} className="max-h-64 overflow-auto">
              {jurisdictions.map((jurisdiction, index) => {
                const isSelected = jurisdiction.slug === selected;
                const startsSchoolDistricts =
                  jurisdiction.isSchoolDistrict && !jurisdictions[index - 1]?.isSchoolDistrict;

                return (
                  <Fragment key={jurisdiction.slug}>
                    {startsSchoolDistricts ? (
                      <div className="menu-section-label">
                        {selectedLocale === "es" ? "Distrito escolar" : "School district"}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={cn(
                        "menu-option",
                        jurisdiction.isChild && !jurisdiction.isSchoolDistrict && "menu-option-child",
                        isSelected && "menu-option-selected"
                      )}
                      onClick={() => changeJurisdiction(jurisdiction.slug)}
                    >
                      <Check
                        aria-hidden="true"
                        className={`h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`}
                      />
                      <span
                        className="truncate"
                      >
                        {jurisdictionLabel(jurisdiction, selectedLocale)}
                      </span>
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      <div ref={languageMenuRef} className="relative col-span-5 md:order-1 md:ml-2 md:shrink-0">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isLanguageMenuOpen}
          aria-busy={isLanguagePending}
          aria-label={`${t(selectedLocale, "language")}: ${selectedLanguage.label}`}
          className={cn("menu-trigger", desktopPickerTrigger)}
          onClick={() => setIsLanguageMenuOpen((isOpen) => !isOpen)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Languages aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
            <span className="truncate md:hidden">{selectedLanguage.label}</span>
            <span aria-hidden="true" className="hidden md:inline">
              {selectedLanguage.shortLabel}
            </span>
          </span>
          {isLanguagePending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-civic" />
          ) : (
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-black/60 transition ${
                isLanguageMenuOpen ? "rotate-180" : ""
              }`}
            />
          )}
        </button>
        {isLanguageMenuOpen ? (
          <div className="menu-popover md:w-40">
            <div role="listbox" aria-label={t(selectedLocale, "language")} className="max-h-64 overflow-auto">
              {LANGUAGE_OPTIONS.map((option) => {
                const isSelected = option.locale === selectedLocale;

                return (
                  <button
                    key={option.locale}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cn("menu-option", isSelected && "menu-option-selected")}
                    onClick={() => changeLanguage(option.locale)}
                  >
                    <Check
                      aria-hidden="true"
                      className={`h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      {nav.map((item, index) => {
        const isActive = isActiveNavItem(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={hrefWithJurisdiction(item.href)}
            aria-current={isActive ? "page" : undefined}
            onClick={() => setIsMobileMenuOpen(false)}
            className={`${navItemClasses(item, index === 0)} relative inline-flex min-h-11 items-center justify-center rounded-md px-1 py-2 text-center text-xs transition md:whitespace-nowrap focus-visible:focus-ring md:px-2 md:text-sm lg:px-3.5 ${
              isActive
                ? "text-civic after:absolute after:bottom-1 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-civic"
                : "text-black/70 hover:bg-black/[0.04] hover:text-ink"
            }`}
          >
            {"compactIcon" in item ? (
              <item.compactIcon aria-hidden className="hidden h-4 w-4 md:max-xl:block" />
            ) : null}
            <span className={cn("inline-grid", "compactIcon" in item && "md:max-xl:sr-only")}>
              <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-black">
                {t(selectedLocale, item.labelKey)}
              </span>
              <span className={`col-start-1 row-start-1 ${isActive ? "font-black" : "font-semibold"}`}>
                {t(selectedLocale, item.labelKey)}
              </span>
            </span>
          </Link>
        );
      })}
      </div>
    </nav>
  );
}

export function HeaderNavFallback({ locale = "en" }: { locale?: Locale }) {
  return (
    <nav
      aria-label={t(locale, "primaryNavigation")}
      className="contents text-sm font-semibold text-ink md:flex md:min-w-0 md:flex-1"
    >
      <span className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-black/15 bg-white px-3 py-2 font-bold shadow-sm md:hidden">
        <Menu aria-hidden className="h-4 w-4 text-civic" />
        {t(locale, "menu")}
      </span>
      <div className="hidden md:flex md:min-w-0 md:flex-1 md:items-center md:gap-1">
      <label className={cn("menu-trigger md:order-1 md:ml-2 md:max-w-[11rem] lg:ml-4 lg:max-w-[15rem]", desktopPickerTrigger)}>
        <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
        <span className="sr-only">{t(locale, "jurisdiction")}</span>
        <select
          defaultValue="san-mateo"
          className="w-full bg-transparent text-sm font-bold text-ink outline-none"
        >
          {jurisdictions.map((jurisdiction) => (
            <option key={jurisdiction.slug} value={jurisdiction.slug}>
              {jurisdiction.isChild && !jurisdiction.isSchoolDistrict
                  ? `  ${jurisdictionLabel(jurisdiction, locale)}`
                  : jurisdictionLabel(jurisdiction, locale)}
            </option>
          ))}
        </select>
      </label>
      <span className="relative md:order-1 md:ml-2 md:shrink-0">
      <label className={cn("menu-trigger", desktopPickerTrigger)}>
        <Languages aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
        <span className="sr-only">{t(locale, "language")}</span>
        <select
          defaultValue={locale}
          className="w-full bg-transparent text-sm font-bold text-ink outline-none"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.locale} value={option.locale}>
              {option.shortLabel}
            </option>
          ))}
        </select>
      </label>
      </span>
      {nav.map((item, index) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-md px-2 py-2 text-center text-black/70 transition hover:bg-black/[0.04] hover:text-ink focus-visible:focus-ring lg:px-3.5",
            navItemClasses(item, index === 0)
          )}
        >
          {"compactIcon" in item ? (
            <item.compactIcon aria-hidden className="hidden h-4 w-4 md:max-xl:block" />
          ) : null}
          <span className={cn("compactIcon" in item && "md:max-xl:sr-only")}>
            {t(locale, item.labelKey)}
          </span>
        </Link>
      ))}
      </div>
    </nav>
  );
}
