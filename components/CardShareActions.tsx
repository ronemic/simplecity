"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useState } from "react";

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
      // Clipboard API needs a secure context and permission; fall back to a
      // hidden textarea so copying still works where it is unavailable.
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

  // Always copies the link rather than opening the native share sheet.
  //
  // This used to branch on `navigator.share`, so the button read "Share" in
  // browsers that support it and "Copy link" in those that do not — the same
  // control was labelled two different things depending on the visitor's
  // browser, and its behaviour changed with it. Copying is one predictable
  // outcome, and the label can now be written with confidence.
  async function handleCopy() {
    const url = `${window.location.origin}/cards/${encodeURIComponent(cardId)}`;
    try {
      if (await copyLink(url)) setCopied(true);
    } catch {}
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className={compact ? "action-secondary-sm" : "action-primary"}
        aria-live="polite"
      >
        {copied ? <Check aria-hidden className="h-4 w-4" /> : <Link2 aria-hidden className="h-4 w-4" />}
        {copied
          ? locale === "es"
            ? "Enlace copiado"
            : "Link copied"
          : locale === "es"
            ? "Copiar enlace"
            : "Copy link"}
      </button>
    </div>
  );
}
