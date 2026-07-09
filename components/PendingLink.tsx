"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

function shouldIgnoreClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  );
}

function normalizeHref(href: string) {
  const url = new URL(href, "http://simplecity.local");
  return `${url.pathname}${url.search}`;
}

type PendingLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
  mode?: "inline" | "overlay";
  contentClassName?: string;
  prefetch?: boolean;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children" | "className" | "onClick">;

export function PendingLink({
  href,
  children,
  className,
  pendingLabel,
  mode = "inline",
  contentClassName,
  prefetch = true,
  ...rest
}: PendingLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!pending || !pendingHref) return;

    const currentHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (currentHref === pendingHref) {
      const timer = window.setTimeout(() => {
        setPending(false);
        setPendingHref(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [pending, pendingHref, pathname, searchParams]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (shouldIgnoreClick(event)) return;

    event.preventDefault();
    setPendingHref(normalizeHref(href));
    setPending(true);
    router.push(href);
  }

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={handleClick}
      aria-busy={pending}
      className={cn(
        className,
        "relative",
        mode === "overlay" && "overflow-hidden",
        pending && "pointer-events-none"
      )}
      {...rest}
    >
      {mode === "overlay" ? (
        <>
          <span className={cn("inline-flex items-center gap-2 transition-opacity", pending && "opacity-0", contentClassName)}>
            {children}
          </span>
          {pending ? (
            <span className="absolute inset-0 flex items-center justify-center gap-2 rounded-[inherit] bg-white/80 text-sm font-semibold text-black/70 backdrop-blur-sm">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin text-civic" />
              <span className="sr-only">{pendingLabel || "Loading"}</span>
            </span>
          ) : null}
        </>
      ) : (
        <>
          <span className={cn("inline-flex items-center gap-2 transition-opacity", pending && "opacity-0", contentClassName)}>
            {children}
          </span>
          {pending ? (
            <span className="absolute inset-0 flex items-center justify-center text-current">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              <span className="sr-only">{pendingLabel || "Loading"}</span>
            </span>
          ) : null}
        </>
      )}
    </Link>
  );
}
