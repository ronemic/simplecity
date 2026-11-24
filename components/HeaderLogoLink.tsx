"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The home page falls back to the saved place, so a bare "/" would jump a
 * reader viewing `?jurisdiction=san-mateo` back to whatever they picked last.
 * The logo keeps the place (and language) the current URL names.
 */
export function homeHrefFor(searchParams: Pick<URLSearchParams, "get">) {
  const params = new URLSearchParams();
  const jurisdiction = searchParams.get("jurisdiction");
  const lang = searchParams.get("lang");
  if (jurisdiction) params.set("jurisdiction", jurisdiction);
  if (lang) params.set("lang", lang);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function HeaderLogoLink({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  return (
    <Link href={homeHrefFor(searchParams)} className={className}>
      {children}
    </Link>
  );
}
