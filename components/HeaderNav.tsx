"use client";

import { Check, ChevronDown, MapPin } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const nav = [
  { href: "/decisions", label: "Decisions" },
  { href: "/meetings", label: "Meetings" },
  { href: "/categories", label: "Topics" },
  { href: "/about", label: "About" }
];

const jurisdictions = [
  { slug: "all", label: "All" },
  { slug: "foster-city", label: "Foster City" },
  { slug: "san-mateo", label: "San Mateo" },
  { slug: "san-mateo-county", label: "San Mateo County" },
  { slug: "santa-clara-county", label: "Santa Clara County" }
];

const JURISDICTION_STORAGE_KEY = "simplecity.jurisdiction";

function normalizeJurisdiction(value: string | null | undefined): string {
  if (value === "san-mateo-city") return "san-mateo";
  if (jurisdictions.some((jurisdiction) => jurisdiction.slug === value)) {
    return value || "san-mateo";
  }
  return "san-mateo";
}

export function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isJurisdictionMenuOpen, setIsJurisdictionMenuOpen] = useState(false);
  const jurisdictionMenuRef = useRef<HTMLDivElement>(null);
  const requested = normalizeJurisdiction(searchParams.get("jurisdiction"));
  const selected = requested;
  const selectedJurisdiction =
    jurisdictions.find((jurisdiction) => jurisdiction.slug === selected) || jurisdictions[1];

  useEffect(() => {
    try {
      const storedJurisdiction = window.localStorage.getItem(JURISDICTION_STORAGE_KEY);
      const normalizedStoredJurisdiction = normalizeJurisdiction(storedJurisdiction);

      if (!searchParams.has("jurisdiction")) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("jurisdiction", normalizedStoredJurisdiction);
        router.replace(`${pathname}?${params.toString()}`);
        return;
      }

      window.localStorage.setItem(JURISDICTION_STORAGE_KEY, selected);
    } catch {
      // Ignore storage failures and keep the URL-driven behavior.
    }
  }, [pathname, router, searchParams, selected]);

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

  function hrefWithJurisdiction(href: string) {
    const [path, hash] = href.split("#");
    const params = new URLSearchParams();
    params.set("jurisdiction", selected);
    return `${path || "/"}?${params.toString()}${hash ? `#${hash}` : ""}`;
  }

  function changeJurisdiction(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("jurisdiction", value);
    setIsJurisdictionMenuOpen(false);
    try {
      window.localStorage.setItem(JURISDICTION_STORAGE_KEY, value);
    } catch {
      // Ignore storage failures so the selector still works normally.
    }
    router.push(`${pathname}?${params.toString()}`);
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
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-black/15 bg-white/[0.85] px-3 py-2 text-left text-sm font-bold text-ink shadow-sm transition hover:border-civic/30 hover:bg-white focus-visible:focus-ring"
          onClick={() => setIsJurisdictionMenuOpen((isOpen) => !isOpen)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-civic" />
            <span className="truncate">{selectedJurisdiction.label}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-black/60 transition ${
              isJurisdictionMenuOpen ? "rotate-180" : ""
            }`}
          />
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
                    <span className="truncate">{jurisdiction.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      {nav.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={hrefWithJurisdiction(item.href)}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-center transition focus-visible:focus-ring md:px-3.5 ${
              isActive
                ? "bg-[#e8eef3] text-[#102134]"
                : "text-black/70 hover:bg-black/[0.04] hover:text-ink"
            }`}
          >
            {item.label}
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
      {nav.map((item) => (
        <Link
          key={item.href}
          href={`${item.href.split("#")[0] || "/"}?jurisdiction=san-mateo${
            item.href.includes("#") ? `#${item.href.split("#")[1]}` : ""
          }`}
          className="inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-center text-black/70 transition hover:bg-black/[0.04] hover:text-ink focus-visible:focus-ring md:px-3.5"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
