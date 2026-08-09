"use client";

import { Layers3, Loader2, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getOrCreateSantaBarbaraInterestDeviceToken,
  markSantaBarbaraInterestSeen,
  readSavedSantaBarbaraInterests,
  writeSavedSantaBarbaraInterests
} from "@/lib/interests/santaBarbaraClient";
import {
  hasInterestUpdate,
  SANTA_BARBARA_INTEREST_CHANGE_EVENT,
  type SavedSantaBarbaraInterest,
  type SantaBarbaraInterestCardUpdate
} from "@/lib/interests/santaBarbara";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

export type SantaBarbaraDecisionView = "all" | "interests";

export function SantaBarbaraInterestHub({
  locale,
  activeView,
  onViewChange
}: {
  locale: Locale;
  activeView: SantaBarbaraDecisionView;
  onViewChange: (view: SantaBarbaraDecisionView) => void;
}) {
  const [interests, setInterests] = useState<SavedSantaBarbaraInterest[]>([]);
  const [updates, setUpdates] = useState<Record<string, SantaBarbaraInterestCardUpdate>>({});
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  const loadUpdates = useCallback(async (saved: SavedSantaBarbaraInterest[]) => {
    setInterests(saved);
    if (saved.length === 0) {
      setUpdates({});
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const interest of saved.slice(0, 50)) params.append("id", interest.cardId);
      const response = await fetch(`/api/interests/santa-barbara?${params.toString()}`, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("Interest updates unavailable");
      const result = (await response.json()) as { cards?: SantaBarbaraInterestCardUpdate[] };
      setUpdates(
        Object.fromEntries((result.cards || []).map((update) => [update.cardId, update]))
      );
      setError("");
    } catch {
      setError(
        locale === "es"
          ? "No se pudieron comprobar las actualizaciones en este momento."
          : "Updates could not be checked right now."
      );
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    function sync() {
      void loadUpdates(readSavedSantaBarbaraInterests());
    }

    sync();
    window.addEventListener(SANTA_BARBARA_INTEREST_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SANTA_BARBARA_INTEREST_CHANGE_EVENT, sync);
  }, [loadUpdates]);

  const updatedCount = useMemo(
    () => interests.filter((interest) => hasInterestUpdate(interest, updates[interest.cardId])).length,
    [interests, updates]
  );

  function openInterest(interest: SavedSantaBarbaraInterest) {
    const update = updates[interest.cardId];
    markSantaBarbaraInterestSeen(
      interest.cardId,
      update?.latestActivityAt || interest.lastSeenActivityAt,
      update?.meetingStatus || interest.lastSeenMeetingStatus
    );
  }

  async function clearInterests() {
    if (
      !window.confirm(
        locale === "es"
          ? "¿Eliminar todos tus intereses guardados y retirar sus señales?"
          : "Remove all of your saved interests and withdraw their signals?"
      )
    ) {
      return;
    }

    const deviceToken = getOrCreateSantaBarbaraInterestDeviceToken();
    if (!deviceToken) return;
    setClearing(true);
    setError("");
    const remaining: SavedSantaBarbaraInterest[] = [];
    for (const interest of interests) {
      try {
        const response = await fetch("/api/interests/santa-barbara", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: interest.cardId, deviceToken, interested: false })
        });
        if (!response.ok) remaining.push(interest);
      } catch {
        remaining.push(interest);
      }
    }

    writeSavedSantaBarbaraInterests(remaining);
    setClearing(false);
    if (remaining.length > 0) {
      setError(
        locale === "es"
          ? "Algunos intereses no se pudieron retirar. Inténtalo de nuevo."
          : "Some interests could not be withdrawn. Please try again."
      );
    }
  }

  return (
    <section className="mb-5 border-b border-black/10 pb-4" aria-label={locale === "es" ? "Vistas de decisiones" : "Decision views"}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="segmented-control w-full sm:w-auto" role="group" aria-label={locale === "es" ? "Mostrar decisiones" : "Show decisions"}>
          <button
            aria-pressed={activeView === "all"}
            className={cn("segmented-button flex-1 justify-center sm:flex-none", activeView === "all" && "segmented-button-selected")}
            onClick={() => onViewChange("all")}
            type="button"
          >
            <Layers3 aria-hidden className="h-4 w-4" />
            {locale === "es" ? "Todas las decisiones" : "All decisions"}
          </button>
          <button
            aria-pressed={activeView === "interests"}
            className={cn("segmented-button flex-1 justify-center sm:flex-none", activeView === "interests" && "segmented-button-selected")}
            onClick={() => onViewChange("interests")}
            type="button"
          >
            <Star aria-hidden className="h-4 w-4" />
            {locale === "es" ? "Mis intereses" : "My interests"}
            <span className={cn("tabular-nums", activeView === "interests" ? "text-white/80" : "text-black/45")}>
              {interests.length}
            </span>
            {updatedCount > 0 ? (
              <span className={cn("h-2 w-2 rounded-full", activeView === "interests" ? "bg-white" : "bg-civic")}>
                <span className="sr-only">{updatedCount} {locale === "es" ? "actualizaciones" : "updates"}</span>
              </span>
            ) : null}
          </button>
        </div>

        <p className="text-xs font-medium leading-5 text-black/55 sm:max-w-xl sm:text-right">
          {locale === "es"
            ? "Guardado en este navegador · Los totales anónimos pueden compartirse con el Condado. No es un voto oficial."
            : "Saved on this browser · Anonymous totals may be shared with the County. Not an official vote."}{" "}
          <Link className="font-bold text-civic underline underline-offset-2" href={`/privacy?lang=${locale}`}>
            {locale === "es" ? "Detalles" : "Details"}
          </Link>
        </p>
      </div>

      {activeView === "interests" ? (
        <div className="mt-4">
          {loading ? (
            <p className="inline-flex items-center gap-2 py-4 text-sm font-bold text-black/60">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              {locale === "es" ? "Buscando actualizaciones" : "Checking for updates"}
            </p>
          ) : interests.length === 0 ? (
            <div className="quiet-card px-5 py-8 text-center">
              <Star aria-hidden className="mx-auto h-5 w-5 text-black/35" />
              <h2 className="mt-2 text-base font-black text-ink">
                {locale === "es" ? "Aún no tienes intereses guardados" : "No saved interests yet"}
              </h2>
              <p className="mt-1 text-sm font-medium leading-6 text-black/60">
                {locale === "es"
                  ? "Selecciona Todas las decisiones y marca los temas que te interesen."
                  : "Return to All decisions and mark the issues you care about."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/10 border-y border-black/10">
              {interests.map((interest) => {
                const update = updates[interest.cardId];
                const hasUpdate = hasInterestUpdate(interest, update);
                return (
                  <Link
                    className="flex items-start justify-between gap-4 px-1 py-3.5 transition hover:bg-black/[0.025] sm:px-3"
                    href={`/cards/${encodeURIComponent(interest.cardId)}?lang=${locale}`}
                    key={interest.cardId}
                    onClick={() => openInterest(interest)}
                  >
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-black leading-5 text-ink">{interest.title}</span>
                      <span className="mt-0.5 block text-xs font-semibold text-black/50">{interest.meetingDate}</span>
                    </span>
                    {hasUpdate ? (
                      <span className="status-chip shrink-0 border-[#aabce6] bg-[#eef2ff] text-[#354f9b]">
                        {update?.hasResult
                          ? locale === "es"
                            ? "Resultado disponible"
                            : "Result available"
                          : locale === "es"
                            ? "Actualizado"
                            : "Updated"}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}

          {interests.length > 0 ? (
            <button className="action-ghost mt-3 !text-[#9f2a20]" disabled={clearing} onClick={clearInterests} type="button">
              {clearing ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden className="h-4 w-4" />}
              {locale === "es" ? "Retirar todos" : "Withdraw all"}
            </button>
          ) : null}
          {error ? <p className="mt-2 text-xs font-bold text-[#9f2a20]" role="status">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
