"use client";

import { Check, ChevronDown, Languages, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { JURISDICTION_PREFERENCE_COOKIE } from "@/lib/config/jurisdictions";
import { LANGUAGE_OPTIONS, LOCALE_COOKIE, type Locale, t } from "@/lib/i18n";

const nav = [
  { href: "/decisions", labelKey: "decisions" },
  { href: "/meetings", labelKey: "meetings" },
  { href: "/topics", labelKey: "topics" },
  { href: "/about", labelKey: "about" }
] as const;

const jurisdictions = [
  { slug: "all", label: "All" },
  { slug: "foster-city", label: "Foster City" },
  { slug: "san-mateo", label: "San Mateo" },
  { slug: "san-mateo-county", label: "San Mateo County" },
  { slug: "mountain-view", label: "Mountain View" },
  { slug: "santa-clara-county", label: "Santa Clara County" }
];

const JURISDICTION_STORAGE_KEY = "simplecity.jurisdiction";
const LOCALE_STORAGE_KEY = "simplecity.locale";

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
  const [isJurisdictionMenuOpen, setIsJurisdictionMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [selected, setSelected] = useState(() => normalizeJurisdiction(initialJurisdiction));
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale);
  const [isPending, startTransition] = useTransition();
  const [pendingSelector, setPendingSelector] = useState<"jurisdiction" | "language" | null>(null);
  const jurisdictionMenuRef = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const selectedJurisdiction =
    jurisdictions.find((jurisdiction) => jurisdiction.slug === selected) ||
    jurisdictions.find((jurisdiction) => jurisdiction.slug === "san-mateo")!;
  const selectedLanguage =
    LANGUAGE_OPTIONS.find((option) => option.locale === selectedLocale) || LANGUAGE_OPTIONS[0];
  const isJurisdictionPending = isPending && pendingSelector === "jurisdiction";
  const isLanguagePending = isPending && pendingSelector === "language";

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
    return href;
  }

  function hrefWithSelection(key: "jurisdiction" | "lang", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }

  function changeJurisdiction(value: string) {
    setIsJurisdictionMenuOpen(false);
    setSelected(value);
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
    setSelectedLocale(value);
    setPendingSelector("language");
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, value);
      writeLocalePreference(value);
    } catch {
      // Ignore storage failures so the selector still works normally.
    }
    startTransition(() => {
      router.push(hrefWithSelection("lang", value), { scroll: false });
    });
  }

  return (
    <nav
      aria-label="Primary navigation"
      className="grid w-full grid-cols-4 items-center gap-1 text-sm font-semibold text-ink md:flex md:w-auto md:justify-end md:gap-1"
    >
      <div ref={jurisdictionMenuRef} className="relative col-span-4 md:col-span-1 md:mr-2 md:w-48">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isJurisdictionMenuOpen}
          aria-busy={isJurisdictionPending}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-black/15 bg-white/[0.85] px-3 py-2 text-left text-sm font-bold text-ink shadow-sm transition hover:border-civic/30 hover:bg-white focus-visible:focus-ring"
          onClick={() => setIsJurisdictionMenuOpen((isOpen) => !isOpen)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
            <span className="truncate">{jurisdictionLabel(selectedJurisdiction, selectedLocale)}</span>
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
          <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-lg border border-black/15 bg-white py-1 shadow-[0_18px_46px_rgba(12,24,40,0.14)]">
            <div role="listbox" aria-label="Jurisdiction" className="max-h-64 overflow-auto">
              {jurisdictions.map((jurisdiction) => {
                const isSelected = jurisdiction.slug === selected;

                return (
                  <button
                    key={jurisdiction.slug}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`grid min-h-10 w-full grid-cols-[1.25rem_1fr] items-center gap-2 px-3 py-2 text-left text-sm font-bold transition ${
                      isSelected
                        ? "bg-[#12365f] text-white"
                        : "text-ink hover:bg-[#eef4f8] focus-visible:bg-[#eef4f8]"
                    }`}
                    onClick={() => changeJurisdiction(jurisdiction.slug)}
                  >
                    <Check
                      aria-hidden="true"
                      className={`h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="truncate">{jurisdictionLabel(jurisdiction, selectedLocale)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      <div ref={languageMenuRef} className="relative col-span-4 md:col-span-1 md:mr-2 md:w-36">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isLanguageMenuOpen}
          aria-busy={isLanguagePending}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-black/15 bg-white/[0.85] px-3 py-2 text-left text-sm font-bold text-ink shadow-sm transition hover:border-civic/30 hover:bg-white focus-visible:focus-ring"
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
          <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-lg border border-black/15 bg-white py-1 shadow-[0_18px_46px_rgba(12,24,40,0.14)]">
            <div role="listbox" aria-label={t(selectedLocale, "language")} className="max-h-64 overflow-auto">
              {LANGUAGE_OPTIONS.map((option) => {
                const isSelected = option.locale === selectedLocale;

                return (
                  <button
                    key={option.locale}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`grid min-h-10 w-full grid-cols-[1.25rem_1fr] items-center gap-2 px-3 py-2 text-left text-sm font-bold transition ${
                      isSelected
                        ? "bg-[#12365f] text-white"
                        : "text-ink hover:bg-[#eef4f8] focus-visible:bg-[#eef4f8]"
                    }`}
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
            className={`relative inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-center transition focus-visible:focus-ring md:px-3.5 ${
              isActive
                ? "font-black text-civic after:absolute after:bottom-1 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-civic"
                : "text-black/70 hover:bg-black/[0.04] hover:text-ink"
            }`}
          >
            {t(selectedLocale, item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

export function HeaderNavFallback() {
  return (
    <nav
      aria-label="Primary navigation"
      className="grid w-full grid-cols-4 items-center gap-1 text-sm font-semibold text-ink md:flex md:w-auto md:justify-end md:gap-1"
    >
      <label className="col-span-4 flex min-h-11 items-center gap-2 rounded-lg border border-black/15 bg-white/[0.85] px-3 py-2 shadow-sm md:col-span-1 md:mr-2 md:w-48">
        <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
        <span className="sr-only">Jurisdiction</span>
        <select
          defaultValue="san-mateo"
          className="w-full bg-transparent text-sm font-bold text-ink outline-none"
        >
          {jurisdictions.map((jurisdiction) => (
            <option key={jurisdiction.slug} value={jurisdiction.slug}>
              {jurisdiction.label}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-4 flex min-h-11 items-center gap-2 rounded-lg border border-black/15 bg-white/[0.85] px-3 py-2 shadow-sm md:col-span-1 md:mr-2 md:w-36">
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
          className="inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-center text-black/70 transition hover:bg-black/[0.04] hover:text-ink focus-visible:focus-ring md:px-3.5"
        >
          {t("en", item.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
