"use client";

import { Info, Loader2, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  getOrCreateSantaBarbaraInterestDeviceToken,
  readSavedSantaBarbaraInterests,
  removeSavedSantaBarbaraInterest,
  saveSantaBarbaraInterest
} from "@/lib/interests/santaBarbaraClient";
import { SANTA_BARBARA_INTEREST_CHANGE_EVENT } from "@/lib/interests/santaBarbara";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

export function SantaBarbaraInterestButton({
  cardId,
  title,
  meetingDate,
  meetingStatus,
  activityAt,
  locale
}: {
  cardId: string;
  title: string;
  meetingDate: string;
  meetingStatus: string | null;
  activityAt: string | null;
  locale: Locale;
}) {
  const [interested, setInterested] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const disclosure =
    locale === "es"
      ? "Guardado en este navegador. Los totales anónimos pueden compartirse con el Condado de Santa Bárbara. No es un voto oficial."
      : "Saved on this browser. Anonymous totals may be shared with Santa Barbara County. This is not an official vote.";
  const disclosureId = `interest-disclosure-${cardId}`;
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const disclosureRef = useRef<HTMLDivElement>(null);

  // Click to open, rather than hover.
  //
  // The disclosure contains a "Details" link, and on hover it was unreachable:
  // the panel opens below a narrow icon button, so any diagonal move toward the
  // link left the button sideways onto its neighbour and the panel closed before
  // the pointer arrived. Interactive content in a hover-only layer also fails
  // WCAG 1.4.13, which requires it stay available long enough to use.
  useEffect(() => {
    if (!disclosureOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!disclosureRef.current?.contains(event.target as Node)) setDisclosureOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDisclosureOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [disclosureOpen]);

  useEffect(() => {
    function sync() {
      setInterested(readSavedSantaBarbaraInterests().some((item) => item.cardId === cardId));
      setLoaded(true);
    }

    sync();
    window.addEventListener(SANTA_BARBARA_INTEREST_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SANTA_BARBARA_INTEREST_CHANGE_EVENT, sync);
  }, [cardId]);

  async function toggleInterest() {
    const deviceToken = getOrCreateSantaBarbaraInterestDeviceToken();
    if (!deviceToken) {
      setError(
        locale === "es"
          ? "Tu navegador bloqueó el almacenamiento necesario para guardar este interés."
          : "Your browser blocked the storage needed to save this interest."
      );
      return;
    }

    const nextInterested = !interested;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/interests/santa-barbara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, deviceToken, interested: nextInterested })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(
          locale === "es"
            ? "No pudimos actualizar tu interés. Inténtalo de nuevo."
            : result.error || "We could not update your interest. Please try again."
        );
        return;
      }

      if (nextInterested) {
        const now = new Date().toISOString();
        saveSantaBarbaraInterest({
          cardId,
          title,
          meetingDate,
          savedAt: now,
          lastSeenActivityAt: activityAt || now,
          lastSeenMeetingStatus: meetingStatus
        });
      } else {
        removeSavedSantaBarbaraInterest(cardId);
      }
      setInterested(nextInterested);
    } catch {
      setError(
        locale === "es"
          ? "No pudimos actualizar tu interés. Inténtalo de nuevo."
          : "We could not update your interest. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center">
        <button
          aria-pressed={interested}
          className={cn(
            interested
              ? "action-secondary-sm !rounded-r-none !border-civic/35 !bg-civic/10 !text-civic"
              : "action-secondary-sm !rounded-r-none"
          )}
          disabled={!loaded || busy}
          onClick={toggleInterest}
          type="button"
        >
          {busy ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <Star aria-hidden className={cn("h-4 w-4", interested && "fill-current")} />
          )}
          {interested
            ? locale === "es"
              ? "Me interesa"
              : "Interested"
            : locale === "es"
              ? "Me interesa"
              : "I’m interested"}
        </button>
        {/* Same shape on a card and on its own page, so the button row is
            consistent between the two views. */}
        <div className="relative -ml-px" ref={disclosureRef}>
          <button
            aria-controls={disclosureId}
            aria-expanded={disclosureOpen}
            aria-label={locale === "es" ? "Acerca del programa piloto de interés" : "About the interest pilot"}
            className={cn(
              "action-secondary-sm !min-h-10 !w-10 !rounded-l-none !px-0 text-black/55",
              (interested || disclosureOpen) && "!border-civic/35 !bg-civic/10 !text-civic"
            )}
            onClick={() => setDisclosureOpen((value) => !value)}
            type="button"
          >
            <Info aria-hidden className="h-4 w-4" />
          </button>
          {disclosureOpen ? (
            // Opens below and right-aligned, and narrower on small screens: it
            // used to open rightward from a button that already sits at the
            // card's right edge, so it ran off the card and the viewport.
            <div className="absolute right-0 top-full z-40 mt-2 w-[14.5rem] sm:w-72" id={disclosureId}>
              <p className="rounded-lg border border-black/10 bg-white p-3 text-left text-xs font-semibold leading-5 text-black/65 shadow-xl">
                {disclosure}{" "}
                <Link
                  className="font-bold text-civic underline underline-offset-2"
                  href={`/privacy?lang=${locale}`}
                >
                  {locale === "es" ? "Detalles" : "Details"}
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-bold leading-5 text-[#9f2a20]" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
