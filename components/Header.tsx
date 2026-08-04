import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { getRequestLocale } from "@/lib/i18n/server";
import { HeaderNav, HeaderNavFallback } from "@/components/HeaderNav";

export async function Header() {
  const [cookieStore, locale] = await Promise.all([cookies(), getRequestLocale()]);
  const initialJurisdiction = normalizeJurisdictionSelection(
    cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-[#f8fafb]/95 backdrop-blur-md">
      <div className="section-shell grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 md:flex md:min-h-[70px] md:justify-between md:py-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-lg font-black leading-none text-ink focus-visible:focus-ring lg:gap-3 lg:text-[21px]"
        >
          <Image
            src="/favicon.svg"
            alt=""
            width={36}
            height={36}
            className="h-8 w-8 shrink-0 rounded-lg lg:h-9 lg:w-9"
            priority
          />
          <span className="md:hidden min-[980px]:inline">SimpleCity</span>
        </Link>
        <Suspense fallback={<HeaderNavFallback />}>
          <HeaderNav
            key={`${toPublicJurisdictionSlug(initialJurisdiction)}-${locale}`}
            initialJurisdiction={toPublicJurisdictionSlug(initialJurisdiction)}
            locale={locale}
          />
        </Suspense>
      </div>
    </header>
  );
}
