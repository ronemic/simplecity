"use client";

import { Bell, Check, ChevronDown, Languages, Loader2, MapPin, Menu, School, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
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
  parentSlug: jurisdiction.parentCountySlug,
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

function readJurisdictionPreference(): string | null {
  const prefix = `${JURISDICTION_PREFERENCE_COOKIE}=`;
  const entry = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return null;
  }
}

// The cookie only changes through this component or a full reload, and every
// in-app navigation re-renders the header, so there is nothing to subscribe to.
const subscribeToJurisdictionPreference = () => () => {};

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
  // Pages without ?jurisdiction= render for the saved cookie, so the picker
  // reads that cookie too. The prop alone goes stale: the header can come from
  // a render made before the reader picked a different area.
  const storedJurisdiction = useSyncExternalStore(
    subscribeToJurisdictionPreference,
    readJurisdictionPreference,
    () => initialJurisdiction
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
          <JurisdictionMenu
            locale={selectedLocale}
            onSelect={changeJurisdiction}
            selected={selected}
          />
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

function foldForSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// The picker lists every city, county and school district we cover, which is
// too many to scan, so it opens with a search box. A query matches an area's
// own name or its county's, so "santa clara" keeps the county and its cities.
function JurisdictionMenu({
  locale,
  onSelect,
  selected
}: {
  locale: Locale;
  onSelect: (slug: string) => void;
  selected: string;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listId = useId();
  const folded = foldForSearch(query.trim());
  const isFiltering = folded.length > 0;
  const options = isFiltering
    ? jurisdictions.filter((jurisdiction) => {
        const own = foldForSearch(jurisdictionLabel(jurisdiction, locale));
        const parent = jurisdiction.parentSlug
          ? foldForSearch(getJurisdictionDisplayLabel(jurisdiction.parentSlug, locale))
          : "";
        return own.includes(folded) || parent.includes(folded);
      })
    : jurisdictions;
  const selectedIndex = options.findIndex((jurisdiction) => jurisdiction.slug === selected);
  // With no query the highlight starts on the current area; once the reader
  // types, it starts on the first match so Enter picks it.
  const highlighted = Math.min(
    activeIndex ?? (isFiltering ? 0 : Math.max(selectedIndex, 0)),
    options.length - 1
  );
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    if (highlighted < 0) return;
    document.getElementById(optionId(highlighted))?.scrollIntoView({ block: "nearest" });
    // optionId only depends on listId, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((highlighted + step + options.length) % options.length);
    } else if (event.key === "Home" && options.length > 0 && !query) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && options.length > 0 && !query) {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[highlighted];
      if (option) onSelect(option.slug);
    }
  }

  return (
    <div className="menu-popover md:w-72">
      <div className="border-b border-black/10 px-2 pb-2 pt-1">
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-black/15 bg-[#f7f9fb] px-2.5 focus-within:border-civic focus-within:bg-white">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-black/45" />
          <span className="sr-only">
            {locale === "es" ? "Buscar un área" : "Search areas"}
          </span>
          <input
            // The menu only mounts when the reader opens it, so focusing the
            // search box straight away is what they asked for.
            autoFocus
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={highlighted >= 0 ? optionId(highlighted) : undefined}
            className="w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:font-medium placeholder:text-black/40"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={locale === "es" ? "Buscar ciudad o condado" : "Search city or county"}
            type="text"
            value={query}
          />
        </label>
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label={t(locale, "jurisdiction")}
        className="max-h-[min(26rem,60vh)] overflow-auto py-1"
      >
        {options.length === 0 ? (
          <p className="px-4 py-3 text-sm font-medium text-black/55">
            {locale === "es" ? "Ningún área coincide." : "No matching areas."}
          </p>
        ) : null}
        {options.map((jurisdiction, index) => {
          const isSelected = jurisdiction.slug === selected;
          const isHighlighted = index === highlighted;
          const startsSchoolDistricts =
            jurisdiction.isSchoolDistrict && !options[index - 1]?.isSchoolDistrict;
          // Without a query the list is long, so a rule above each county
          // separates one county's cities from the next.
          const startsCounty =
            !isFiltering &&
            index > 0 &&
            !jurisdiction.isChild &&
            !jurisdiction.isSchoolDistrict;

          return (
            <Fragment key={jurisdiction.slug}>
              {startsSchoolDistricts ? (
                <div className="menu-section-label">
                  {locale === "es" ? "Distrito escolar" : "School district"}
                </div>
              ) : null}
              <button
                id={optionId(index)}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                className={cn(
                  "menu-option",
                  !isFiltering &&
                    jurisdiction.isChild &&
                    !jurisdiction.isSchoolDistrict &&
                    "menu-option-child",
                  startsCounty && "mt-1 border-t border-black/10 pt-3",
                  isHighlighted && !isSelected && "bg-[#eef4f8]",
                  isSelected && "menu-option-selected",
                  isHighlighted && isSelected && "ring-2 ring-inset ring-[#7fb0e6]"
                )}
                onClick={() => onSelect(jurisdiction.slug)}
                onMouseMove={() => {
                  if (index !== highlighted) setActiveIndex(index);
                }}
              >
                <Check
                  aria-hidden="true"
                  className={`h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`}
                />
                <span className="truncate">{jurisdictionLabel(jurisdiction, locale)}</span>
                {isFiltering && jurisdiction.parentSlug && !jurisdiction.isSchoolDistrict ? (
                  <span
                    className={cn(
                      "col-start-2 -mt-1 truncate text-xs font-medium",
                      isSelected ? "text-white/70" : "text-black/50"
                    )}
                  >
                    {getJurisdictionDisplayLabel(jurisdiction.parentSlug, locale)}
                  </span>
                ) : null}
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
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
