"use client";

import { Check, Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

export function CardShareActions({
  cardId,
  title,
  description,
  compact = false,
  showDownload = !compact,
  locale = "en"
}: {
  cardId: string;
  title: string;
  description: string;
  compact?: boolean;
  showDownload?: boolean;
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
      if (navigator.share) {
        await navigator.share({ title, text: description, url });
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
          : locale === "es" ? "Compartir" : "Share"}
      </button>
      {showDownload ? (
        <a
          href={`/cards/${encodeURIComponent(cardId)}/image`}
          download={`simplecity-${cardId}.png`}
          className={compact ? "action-secondary-sm" : "action-secondary"}
        >
          <Download aria-hidden className="h-4 w-4" />
          {locale === "es" ? "Descargar imagen" : "Download image"}
        </a>
      ) : null}
    </div>
  );
}
