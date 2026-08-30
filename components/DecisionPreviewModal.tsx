"use client";

import Link from "next/link";
import { ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SummaryCard } from "@/components/SummaryCard";
import type { DecisionMapPoint, SummaryCardRow } from "@/lib/types";

type CachedCard = {
  card: SummaryCardRow;
  expiresAt: number;
};

const CARD_CACHE_TTL_MS = 5 * 60 * 1000;
const cardCache = new Map<string, CachedCard>();

function cachedCard(cardId: string, locale: "en" | "es") {
  const cacheKey = `${cardId}:${locale}`;
  const cached = cardCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    cardCache.delete(cacheKey);
    return null;
  }
  return cached.card;
}

export function DecisionPreviewModal({
  point,
  locale,
  onClose
}: {
  point: DecisionMapPoint;
  locale: "en" | "es";
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [card, setCard] = useState<SummaryCardRow | null>(() => cachedCard(point.id, locale));
  const [error, setError] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [onClose]);

  useEffect(() => {
    if (card) return;
    const cacheKey = `${point.id}:${locale}`;
    const controller = new AbortController();
    fetch(`/api/decisions/${encodeURIComponent(point.id)}?lang=${locale}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Decision preview failed: ${response.status}`);
        return response.json() as Promise<{ card: SummaryCardRow }>;
      })
      .then(({ card: nextCard }) => {
        cardCache.set(cacheKey, {
          card: nextCard,
          expiresAt: Date.now() + CARD_CACHE_TTL_MS
        });
        setCard(nextCard);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      });

    return () => controller.abort();
  }, [card, locale, point]);

  return createPortal(
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={locale === "es" ? "Vista previa de la decisión" : "Decision preview"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#071426]/60 p-3 backdrop-blur-sm sm:p-6"
    >
      <div className="max-h-[92dvh] w-full max-w-[70rem] overflow-hidden rounded-2xl bg-[#f6f7f8] text-left shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-black/10 bg-white px-4 py-3 sm:px-5">
          <p className="truncate text-sm font-black text-ink">
            {locale === "es" ? "Vista previa de la decisión" : "Decision preview"}
          </p>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href={point.href}
              target="_blank"
              rel="noreferrer"
              className="action-link text-xs sm:text-sm"
            >
              <span className="hidden sm:inline">
                {locale === "es" ? "Abrir página completa" : "Open full page"}
              </span>
              <span className="sm:hidden">{locale === "es" ? "Abrir" : "Open"}</span>
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </Link>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label={locale === "es" ? "Cerrar vista previa" : "Close preview"}
              className="rounded-lg p-2 text-black/55 transition hover:bg-black/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(92dvh-3.75rem)] overflow-y-auto p-3 sm:p-5">
          {card ? <SummaryCard card={card} locale={locale} presentation="share" /> : null}
          {!card && !error ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm font-bold text-black/60">
              <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
              {locale === "es" ? "Cargando decisión…" : "Loading decision…"}
            </div>
          ) : null}
          {error ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <p className="font-bold text-ink">
                {locale === "es"
                  ? "No se pudo cargar esta decisión."
                  : "This decision could not be loaded."}
              </p>
              <Link href={point.href} target="_blank" rel="noreferrer" className="action-primary-sm">
                {locale === "es" ? "Abrir página completa" : "Open full page"}
                <ExternalLink aria-hidden className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
