"use client";

import { Check, ChevronDown, Languages, Loader2, MapPin, Menu, School, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import {
  JURISDICTION_PREFERENCE_COOKIE,
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
  { href: "/subscribe", labelKey: "subscribe" },
  { href: "/about", labelKey: "about" }
] as const;

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
  return jurisdiction.slug === "all" ? t(locale, "all") : jurisdiction.label;
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
    if (href === "/decisions" || href === "/meetings") {
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
      aria-label="Primary navigation"
      className="contents text-sm font-semibold text-ink md:ml-auto md:block"
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
        } col-span-2 grid min-h-0 w-full grid-cols-5 items-center gap-1 transition-[max-height,margin,opacity,transform,visibility] duration-200 ease-out md:pointer-events-auto md:visible md:mt-0 md:flex md:max-h-none md:w-auto md:translate-y-0 md:items-center md:justify-end md:gap-1 md:overflow-visible md:opacity-100`}
        id="mobile-primary-navigation"
      >
      <div ref={jurisdictionMenuRef} className="relative col-span-5 md:mr-1 md:w-40 md:shrink-0 min-[900px]:w-52 lg:mr-2">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isJurisdictionMenuOpen}
          aria-busy={isJurisdictionPending}
          className="menu-trigger"
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
          <div className="menu-popover">
            <div role="listbox" aria-label="Jurisdiction" className="max-h-64 overflow-auto">
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
      <div ref={languageMenuRef} className="relative col-span-5 md:mr-1 md:w-28 md:shrink-0 min-[900px]:!w-36 lg:mr-2">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isLanguageMenuOpen}
          aria-busy={isLanguagePending}
          className="menu-trigger"
          onClick={() => setIsLanguageMenuOpen((isOpen) => !isOpen)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Languages aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
            <span className="truncate">{selectedLanguage.label}</span>
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
          <div className="menu-popover">
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
      {nav.map((item) => {
        const isActive = isActiveNavItem(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={hrefWithJurisdiction(item.href)}
            aria-current={isActive ? "page" : undefined}
            onClick={() => setIsMobileMenuOpen(false)}
            className={`relative inline-flex min-h-11 items-center justify-center rounded-md px-1 py-2 text-center text-xs transition focus-visible:focus-ring md:px-2 md:text-sm lg:px-3.5 ${
              isActive
                ? "font-black text-civic after:absolute after:bottom-1 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-civic"
                : "text-black/70 hover:bg-black/[0.04] hover:text-ink"
            }`}
          >
            {t(selectedLocale, item.labelKey)}
          </Link>
        );
      })}
      </div>
    </nav>
  );
}

export function HeaderNavFallback() {
  return (
    <nav
      aria-label="Primary navigation"
      className="contents text-sm font-semibold text-ink md:ml-auto md:block"
    >
      <span className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-black/15 bg-white px-3 py-2 font-bold shadow-sm md:hidden">
        <Menu aria-hidden className="h-4 w-4 text-civic" />
        Menu
      </span>
      <div className="hidden md:flex md:items-center md:justify-end">
      <label className="menu-trigger md:mr-1 md:w-40 md:shrink-0 min-[900px]:w-52 lg:mr-2">
        <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
        <span className="sr-only">Jurisdiction</span>
        <select
          defaultValue="san-mateo"
          className="w-full bg-transparent text-sm font-bold text-ink outline-none"
        >
          {jurisdictions.map((jurisdiction) => (
            <option key={jurisdiction.slug} value={jurisdiction.slug}>
              {jurisdiction.isChild && !jurisdiction.isSchoolDistrict
                  ? `  ${jurisdiction.label}`
                  : jurisdiction.label}
            </option>
          ))}
        </select>
      </label>
      <label className="menu-trigger md:mr-1 md:w-28 md:shrink-0 min-[900px]:!w-36 lg:mr-2">
        <Languages aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
        <span className="sr-only">Language</span>
        <select
          defaultValue="en"
          className="w-full bg-transparent text-sm font-bold text-ink outline-none"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.locale} value={option.locale}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="inline-flex min-h-11 items-center justify-center rounded-md px-2 py-2 text-center text-black/70 transition hover:bg-black/[0.04] hover:text-ink focus-visible:focus-ring lg:px-3.5"
        >
          {t("en", item.labelKey)}
        </Link>
      ))}
      </div>
    </nav>
  );
}
