"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HOMEPAGE_DATA_PARAM } from "@/lib/homepageData";

/**
 * Keeps database work out of the initial document request. Once the static
 * homepage shell is interactive, request the RSC payload that fills its loading
 * states without replacing the shell or resetting browser state.
 */
export function HomepageDataLoader({ loaded = false }: { loaded?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (loaded) {
      params.delete(HOMEPAGE_DATA_PARAM);
      const query = params.toString();
      window.history.replaceState(window.history.state, "", `${pathname}${query ? `?${query}` : ""}`);
      return;
    }

    if (requested.current) return;
    requested.current = true;

    params.set(HOMEPAGE_DATA_PARAM, "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [loaded, pathname, router, searchParams]);

  return null;
}
