"use client";

import { Info, Loader2, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  locale,
  showDisclosure = false
}: {
  cardId: string;
  title: string;
  meetingDate: string;
  meetingStatus: string | null;
  activityAt: string | null;
  locale: Locale;
  showDisclosure?: boolean;
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
    <div className={cn("min-w-0", showDisclosure && "max-w-sm")}>
      <div className="flex items-center">
        <button
          aria-pressed={interested}
          className={cn(
            interested
              ? "action-secondary-sm !rounded-r-none !border-brand/35 !bg-brand-tint !text-brand"
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
        {!showDisclosure ? (
          <div className="group relative -ml-px">
            <button
              aria-describedby={disclosureId}
              aria-label={locale === "es" ? "Acerca del programa piloto de interés" : "About the interest pilot"}
              className={cn(
                "action-secondary-sm !min-h-10 !w-10 !cursor-help !rounded-l-none !px-0 text-quiet",
                interested && "!border-brand/35 !bg-brand-tint !text-brand"
              )}
              type="button"
            >
              <Info aria-hidden className="h-4 w-4" />
            </button>
            <div
              // Opens below and right-aligned. It used to open rightward from a
              // button that already sits at the card's right edge, so it ran
              // straight off the card and the viewport.
              // Narrower on small screens: right-aligned to a button that sits
              // near the viewport edge, a full 18rem ran off the left side.
              className="pointer-events-none invisible absolute right-0 top-full z-40 mt-2 w-[14.5rem] opacity-0 transition group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 sm:w-72"
              id={disclosureId}
              role="tooltip"
            >
              <p className="rounded-lg border border-rule bg-surface p-3 text-left text-xs font-semibold leading-5 text-slate shadow-xl">
                {disclosure}{" "}
                <Link
                  className="font-bold text-brand underline underline-offset-2"
                  href={`/privacy?lang=${locale}`}
                >
                  {locale === "es" ? "Detalles" : "Details"}
                </Link>
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {showDisclosure ? (
        <p className="mt-2 max-w-sm text-xs font-semibold leading-5 text-quiet">
          {disclosure}{" "}
          <Link
            className="font-bold text-brand underline underline-offset-2"
            href={`/privacy?lang=${locale}`}
          >
            {locale === "es" ? "Detalles" : "Details"}
          </Link>
        </p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-xs font-bold leading-5 text-deny" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
