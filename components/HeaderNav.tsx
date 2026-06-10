"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const nav = [
  { href: "/", label: "Home" },
  { href: "/meetings", label: "Meetings" },
  { href: "/categories", label: "Categories" },
  { href: "/about", label: "About" }
];

const jurisdictions = [
  { slug: "all", label: "All" },
  { slug: "foster-city", label: "Foster City" },
  { slug: "san-mateo-city", label: "San Mateo City" }
];

export function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("jurisdiction") || "foster-city";
  const selected = jurisdictions.some((jurisdiction) => jurisdiction.slug === requested)
    ? requested
    : "foster-city";

  function hrefWithJurisdiction(href: string) {
    const params = new URLSearchParams();
    params.set("jurisdiction", selected);
    return `${href}?${params.toString()}`;
  }

  function changeJurisdiction(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("jurisdiction", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <nav className="grid w-full grid-cols-2 gap-2 text-base font-semibold text-ink sm:flex sm:w-auto sm:items-center sm:justify-end sm:gap-2">
      <label className="col-span-2 flex min-h-12 items-center gap-2 rounded-lg border border-black/25 bg-white px-3 py-2 shadow-sm sm:col-span-1">
        <span className="sr-only">Jurisdiction</span>
        <select
          value={selected}
          onChange={(event) => changeJurisdiction(event.target.value)}
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

