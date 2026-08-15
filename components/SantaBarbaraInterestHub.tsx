"use client";

import { ArrowLeft, Loader2, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SummaryCard } from "@/components/SummaryCard";
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
import type { SummaryCardRow } from "@/lib/types";

export type SantaBarbaraDecisionView = "all" | "interests";

export function SantaBarbaraInterestHub({
  locale,
  activeView,
  onViewChange,
  inline = false
}: {
  locale: Locale;
  activeView: SantaBarbaraDecisionView;
  onViewChange: (view: SantaBarbaraDecisionView) => void;
  inline?: boolean;
}) {
  const [interests, setInterests] = useState<SavedSantaBarbaraInterest[]>([]);
  const [updates, setUpdates] = useState<Record<string, SantaBarbaraInterestCardUpdate>>({});
  const [cards, setCards] = useState<Record<string, SummaryCardRow>>({});
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  const loadUpdates = useCallback(async (saved: SavedSantaBarbaraInterest[]) => {
    setInterests(saved);
    if (saved.length === 0) {
      setUpdates({});
      setCards({});
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const interest of saved.slice(0, 50)) params.append("id", interest.cardId);
      params.set("lang", locale);
      const response = await fetch(`/api/interests/santa-barbara?${params.toString()}`, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("Interest updates unavailable");
      const result = (await response.json()) as {
        updates?: SantaBarbaraInterestCardUpdate[];
        cards?: SummaryCardRow[];
      };
      setUpdates(
        Object.fromEntries((result.updates || []).map((update) => [update.cardId, update]))
      );
      setCards(
        Object.fromEntries((result.cards || []).map((card) => [card.id, card]))
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
    <section className={inline ? "" : "mb-3"} aria-label={locale === "es" ? "Vistas de decisiones" : "Decision views"}>
      <div className="flex justify-end">
        <div>
          {activeView === "interests" ? (
          <button
            className="action-link text-sm"
            onClick={() => onViewChange("all")}
            type="button"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
            {locale === "es" ? "Volver a todas las decisiones" : "Back to all decisions"}
          </button>
          ) : (
          <button
            className="action-link text-sm"
            onClick={() => onViewChange("interests")}
            type="button"
          >
            <Star aria-hidden className="h-4 w-4" />
            {locale === "es" ? "Mis intereses" : "My interests"}
            <span className="tabular-nums text-black/45">{interests.length}</span>
            {updatedCount > 0 ? (
              <span className="h-2 w-2 rounded-full bg-civic">
                <span className="sr-only">{updatedCount} {locale === "es" ? "actualizaciones" : "updates"}</span>
              </span>
            ) : null}
          </button>
          )}
        </div>
      </div>

      {activeView === "interests" ? (
        <div className="mt-4">
          {loading && Object.keys(cards).length === 0 ? (
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
            <div className="grid gap-3">
              {interests.map((interest) => {
                const update = updates[interest.cardId];
                const hasUpdate = hasInterestUpdate(interest, update);
                const card = cards[interest.cardId];
                if (card) {
                  return (
                    <div key={interest.cardId}>
                      {hasUpdate ? (
                        <span className="status-chip mb-2 border-[#aabce6] bg-[#eef2ff] text-[#354f9b]">
                          {update?.hasResult
                            ? locale === "es"
                              ? "Resultado disponible"
                              : "Result available"
                            : locale === "es"
                              ? "Actualizado"
                              : "Updated"}
                        </span>
                      ) : null}
                      <SummaryCard card={card} locale={locale} />
                    </div>
                  );
                }

                return (
                  <Link
                    className="quiet-card flex items-start justify-between gap-4 px-4 py-4 transition hover:bg-black/[0.025] sm:px-5"
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
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button className="action-ghost !text-[#9f2a20]" disabled={clearing} onClick={clearInterests} type="button">
                {clearing ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Trash2 aria-hidden className="h-4 w-4" />}
                {locale === "es" ? "Retirar todos" : "Withdraw all"}
              </button>
              <Link className="action-link text-xs" href={`/privacy?lang=${locale}`}>
                {locale === "es" ? "Acerca del programa piloto de interés" : "About the interest pilot"}
              </Link>
            </div>
          ) : null}
          {error ? <p className="mt-2 text-xs font-bold text-[#9f2a20]" role="status">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
