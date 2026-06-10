import { Suspense } from "react";
import Link from "next/link";
import { HeaderNav, HeaderNavFallback } from "@/components/HeaderNav";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-newsprint/95 backdrop-blur-xl">
      <div className="section-shell flex min-h-[88px] flex-col items-stretch justify-between gap-4 py-4 sm:flex-row sm:items-center">
        <Link
          href="/"
          className="flex items-center gap-3 text-[22px] font-bold leading-none text-ink focus-visible:focus-ring"
        >
          <img src="/favicon.svg" alt="" className="h-9 w-9 shrink-0 rounded-lg shadow-sm" />
          <span>SimpleCity</span>
        </Link>
        <Suspense fallback={<HeaderNavFallback />}>
          <HeaderNav />
        </Suspense>
      </div>
    </header>
  );
}
