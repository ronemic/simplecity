"use client";

import { Loader2, Star } from "lucide-react";
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
      <button
        aria-pressed={interested}
        className={cn(
          interested
            ? "action-secondary-sm !border-civic/35 !bg-civic/10 !text-civic"
            : "action-secondary-sm"
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
      {showDisclosure ? (
        <p className="mt-2 text-xs font-semibold leading-5 text-black/55">
          {locale === "es"
            ? "Se contará como una señal anónima que puede incluirse en totales agregados para el Condado de Santa Bárbara. No es un voto ni comentario público oficial."
            : "Counted as an anonymous signal that may be included in aggregate totals for Santa Barbara County. This is not an official vote or public comment."}{" "}
          <Link
            className="font-bold text-civic underline underline-offset-2"
            href={`/privacy?lang=${locale}`}
          >
            {locale === "es" ? "Privacidad" : "Privacy"}
          </Link>
        </p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-xs font-bold leading-5 text-[#9f2a20]" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
