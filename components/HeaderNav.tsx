"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const nav = [
  { href: "/", label: "Home" },
  { href: "/meetings", label: "Meetings" },
  { href: "/categories", label: "Categories" },
  { href: "/about", label: "About" }
];

const jurisdictions = [
  { slug: "all", label: "All" },
  { slug: "foster-city", label: "Foster City" },
  { slug: "san-mateo-city", label: "San Mateo" }
];

export function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isJurisdictionMenuOpen, setIsJurisdictionMenuOpen] = useState(false);
  const jurisdictionMenuRef = useRef<HTMLDivElement>(null);
  const requested = searchParams.get("jurisdiction") || "foster-city";
  const selected = jurisdictions.some((jurisdiction) => jurisdiction.slug === requested)
    ? requested
    : "foster-city";
  const selectedJurisdiction =
    jurisdictions.find((jurisdiction) => jurisdiction.slug === selected) || jurisdictions[1];

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
    const params = new URLSearchParams();
    params.set("jurisdiction", selected);
    return `${href}?${params.toString()}`;
  }

  function changeJurisdiction(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("jurisdiction", value);
    setIsJurisdictionMenuOpen(false);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <nav className="grid w-full grid-cols-2 gap-2 text-base font-semibold text-ink sm:flex sm:w-auto sm:items-center sm:justify-end sm:gap-2">
      <div ref={jurisdictionMenuRef} className="relative col-span-2 sm:col-span-1 sm:w-44">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isJurisdictionMenuOpen}
          className="flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-black/25 bg-white px-3 py-2 text-left text-sm font-bold text-ink shadow-sm transition hover:border-black/40 hover:bg-black/[0.025] focus-visible:focus-ring"
          onClick={() => setIsJurisdictionMenuOpen((isOpen) => !isOpen)}
        >
          <span className="truncate">{selectedJurisdiction.label}</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-black/60 transition ${
              isJurisdictionMenuOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {isJurisdictionMenuOpen ? (
          <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-lg border border-black/20 bg-white py-1 shadow-soft">
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
                        ? "bg-civic text-white"
                        : "text-ink hover:bg-black/[0.04] focus-visible:bg-black/[0.04]"
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
      {nav.map((item) => (
        <Link
          key={item.href}
          href={hrefWithJurisdiction(item.href)}
          className="inline-flex min-h-12 items-center justify-center rounded-lg border border-black/25 bg-white px-5 py-2 text-center transition hover:border-black/40 hover:bg-black/[0.025] focus-visible:focus-ring"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function HeaderNavFallback() {
  return (
    <nav className="grid w-full grid-cols-2 gap-2 text-base font-semibold text-ink sm:flex sm:w-auto sm:items-center sm:justify-end sm:gap-2">
      <label className="col-span-2 flex min-h-12 items-center gap-2 rounded-lg border border-black/25 bg-white px-3 py-2 shadow-sm sm:col-span-1">
        <span className="sr-only">Jurisdiction</span>
        <select
          defaultValue="foster-city"
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
          href={`${item.href}?jurisdiction=foster-city`}
          className="inline-flex min-h-12 items-center justify-center rounded-lg border border-black/25 bg-white px-5 py-2 text-center transition hover:border-black/40 hover:bg-black/[0.025] focus-visible:focus-ring"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
