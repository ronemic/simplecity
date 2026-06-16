import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { JURISDICTION_PREFERENCE_COOKIE, normalizeJurisdictionSelection } from "@/lib/config/jurisdictions";
import { HeaderNav, HeaderNavFallback } from "@/components/HeaderNav";

export async function Header() {
  const cookieStore = await cookies();
  const initialJurisdiction = normalizeJurisdictionSelection(
    cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-[#f8fafb]/95 backdrop-blur-md">
      <div className="section-shell flex min-h-[70px] flex-col items-stretch justify-between gap-3 py-3 md:flex-row md:items-center">
        <Link
          href="/"
          className="flex items-center gap-3 text-[21px] font-black leading-none text-ink focus-visible:focus-ring"
        >
          <Image
            src="/favicon.svg"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-lg"
            priority
          />
          <span>SimpleCity</span>
        </Link>
        <Suspense fallback={<HeaderNavFallback />}>
          <HeaderNav initialJurisdiction={initialJurisdiction} />
        </Suspense>
      </div>
    </header>
  );
}
