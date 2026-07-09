"use client";

import { Check, Share2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

function subscribeToStaticBrowserCapability() {
  return () => {};
}

function hasNativeShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export function CardShareActions({
  cardId,
  compact = false,
  locale = "en"
}: {
  cardId: string;
  compact?: boolean;
  locale?: "en" | "es";
}) {
  const [copied, setCopied] = useState(false);
  const browserCanNativeShare = useSyncExternalStore(
    subscribeToStaticBrowserCapability,
    hasNativeShare,
    () => false
  );
  const canNativeShare = browserCanNativeShare;

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const didCopy = document.execCommand("copy");
      input.remove();
      return didCopy;
    }
  }

  async function shareCard() {
    const url = `${window.location.origin}/cards/${encodeURIComponent(cardId)}`;

    try {
      if (canNativeShare) {
        await navigator.share({ url });
        return;
      }

      if (await copyLink(url)) setCopied(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;

      try {
        if (await copyLink(url)) setCopied(true);
      } catch {}
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={shareCard}
        className={compact ? "action-secondary-sm" : "action-primary"}
        aria-live="polite"
      >
        {copied ? <Check aria-hidden className="h-4 w-4" /> : <Share2 aria-hidden className="h-4 w-4" />}
        {copied
          ? locale === "es" ? "Enlace copiado" : "Link copied"
          : canNativeShare
            ? locale === "es" ? "Compartir" : "Share"
            : locale === "es" ? "Copiar enlace" : "Copy link"}
      </button>
    </div>
  );
}
