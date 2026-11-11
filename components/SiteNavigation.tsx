"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from "react";
import { siteHref, withoutBetaPrefix } from "@/lib/betaRoutes";

const BetaContext = createContext(false);

export function SiteNavigationProvider({ beta, children }: { beta: boolean; children: ReactNode }) {
  return <BetaContext.Provider value={beta}>{children}</BetaContext.Provider>;
}

export function useBeta() {
  return useContext(BetaContext);
}

export function useSitePathname() {
  const pathname = usePathname();
  return useBeta() ? withoutBetaPrefix(pathname) : pathname;
}

export function useSiteRouter() {
  const router = useRouter();
  const beta = useBeta();
  return useMemo(() => ({
    ...router,
    push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(siteHref(href, beta), options),
    replace: (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(siteHref(href, beta), options),
    prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) => router.prefetch(siteHref(href, beta), options)
  }), [beta, router]);
}

export default function SiteLink({ href, ...props }: ComponentProps<typeof Link>) {
  const beta = useBeta();
  let scopedHref = href;
  if (typeof href === "string") {
    scopedHref = siteHref(href, beta);
  } else if (!href.host && !href.protocol && href.pathname) {
    scopedHref = { ...href, pathname: siteHref(href.pathname, beta) };
  }
  return <Link {...props} href={scopedHref} />;
}

export function SiteForm({ action, ...props }: ComponentProps<"form">) {
  const beta = useBeta();
  return <form {...props} action={typeof action === "string" ? siteHref(action, beta) : action} />;
}
