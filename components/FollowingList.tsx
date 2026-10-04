"use client";

import { Bell, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CardTimeline } from "@/components/CardTimeline";
import { SummaryCard } from "@/components/SummaryCard";
import {
  cardEventsRecordedAfter,
  latestCardEventRecordedAt,
  type CardEvent
} from "@/lib/cardEvents";
import { FOLLOWED_CARDS_CHANGE_EVENT, type FollowedCard } from "@/lib/follows/followedCards";
import {
  markFollowedCardsSeen,
  readFollowedCards,
  unfollowCard
} from "@/lib/follows/followedCardsClient";
import type { Locale } from "@/lib/i18n";
import type { SummaryCardRow } from "@/lib/types";

export function FollowingList({ locale }: { locale: Locale }) {
  const [follows, setFollows] = useState<FollowedCard[]>([]);
  // Results are tagged with the ID set they answer, so "loading" is simply
  // "the latest results are for a different set of follows".
  const [results, setResults] = useState<{
    key: string;
    cards: Record<string, SummaryCardRow>;
    events: Record<string, CardEvent[]>;
  }>({ key: "", cards: {}, events: {} });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  // Only the follow list itself changes on follow/unfollow/mark-seen; the
  // network fetch below runs when the set of followed IDs changes.
  useEffect(() => {
    function sync() {
      setFollows(readFollowedCards());
      setLoaded(true);
    }

    sync();
    window.addEventListener(FOLLOWED_CARDS_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FOLLOWED_CARDS_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const followedIdsKey = follows.map((follow) => follow.cardId).sort().join(",");

  useEffect(() => {
    if (!followedIdsKey) return;
    let cancelled = false;
    const params = new URLSearchParams();
    for (const id of followedIdsKey.split(",")) params.append("id", id);
    params.set("lang", locale);

    fetch(`/api/following?${params.toString()}`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Followed decisions unavailable");
        const result = (await response.json()) as {
          cards?: SummaryCardRow[];
          events?: Record<string, CardEvent[]>;
        };
        if (cancelled) return;
        setResults({
          key: followedIdsKey,
          cards: Object.fromEntries((result.cards || []).map((card) => [card.id, card])),
          events: result.events || {}
        });
        setError("");
      })
      .catch(() => {
        if (cancelled) return;
        // Settle on this key so the page stops waiting and shows what it has.
        setResults((previous) => ({ ...previous, key: followedIdsKey }));
        setError(
          locale === "es"
            ? "No se pudieron comprobar las actualizaciones en este momento."
            : "Updates could not be checked right now."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [followedIdsKey, locale]);

  const { cards, events } = results;
  const loading = Boolean(followedIdsKey) && results.key !== followedIdsKey;

  const newEventsByCard = Object.fromEntries(
    follows.map((follow) => [
      follow.cardId,
      cardEventsRecordedAfter(events[follow.cardId] || [], follow.lastSeenAt)
    ])
  );
  const updatedCount = follows.filter((follow) => newEventsByCard[follow.cardId].length > 0).length;
  // Cards with news first; otherwise most recently followed first.
  const ordered = [...follows].sort(
    (a, b) =>
      Number(newEventsByCard[b.cardId].length > 0) - Number(newEventsByCard[a.cardId].length > 0)
  );

  function markAllSeen() {
    markFollowedCardsSeen(
      Object.fromEntries(
        follows.map((follow) => [follow.cardId, latestCardEventRecordedAt(events[follow.cardId] || [])])
      )
    );
  }

  if (!loaded || (loading && Object.keys(cards).length === 0 && follows.length > 0)) {
    return (
      <p className="inline-flex items-center gap-2 py-4 text-sm font-bold text-black/60">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        {locale === "es" ? "Buscando actualizaciones" : "Checking for updates"}
      </p>
    );
  }

  if (follows.length === 0) {
    return (
      <div className="quiet-card px-5 py-8 text-center">
        <Bell aria-hidden className="mx-auto h-5 w-5 text-black/35" />
        <h2 className="mt-2 text-base font-black text-ink">
          {locale === "es" ? "Aún no sigues ninguna decisión" : "You aren’t following any decisions yet"}
        </h2>
        <p className="mt-1 text-sm font-medium leading-6 text-black/60">
          {locale === "es"
            ? "Pulsa Seguir en cualquier decisión para ver aquí sus cambios."
            : "Tap Follow on any decision to see its changes here."}
        </p>
        <Link className="action-link mt-3" href={`/decisions?lang=${locale}`}>
          {locale === "es" ? "Ver decisiones" : "Browse decisions"}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-black/60" role="status">
          {updatedCount > 0
            ? locale === "es"
              ? `${updatedCount} con cambios desde tu última visita`
              : `${updatedCount} with changes since your last visit`
            : locale === "es"
              ? "Sin cambios desde tu última visita"
              : "No changes since your last visit"}
        </p>
        {updatedCount > 0 ? (
          <button type="button" className="action-secondary-sm" onClick={markAllSeen}>
            {locale === "es" ? "Marcar todo como visto" : "Mark all as seen"}
          </button>
        ) : null}
      </div>
      {error ? <p className="mb-3 text-xs font-bold text-[#9f2a20]" role="status">{error}</p> : null}

      <div className="grid gap-4">
        {ordered.map((follow) => {
          const card = cards[follow.cardId];
          const newEvents = newEventsByCard[follow.cardId];

          if (!card) {
            if (loading) return null;
            return (
              <div
                key={follow.cardId}
                className="quiet-card flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"
              >
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-black leading-5 text-ink">
                    {follow.title || (locale === "es" ? "Decisión" : "Decision")}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-black/50">
                    {locale === "es" ? "Esta decisión ya no está disponible." : "This decision is no longer available."}
                  </span>
                </span>
                <button type="button" className="action-secondary-sm" onClick={() => unfollowCard(follow.cardId)}>
                  {locale === "es" ? "Dejar de seguir" : "Unfollow"}
                </button>
              </div>
            );
          }

          return (
            <div key={follow.cardId}>
              {newEvents.length > 0 ? (
                <div className="mb-2 rounded-lg border border-[#aabce6] bg-[#eef2ff] px-4 py-3">
                  <CardTimeline
                    events={newEvents}
                    locale={locale}
                    newEventIds={new Set(newEvents.map((event) => event.id))}
                    title={locale === "es" ? "Novedades" : "What changed"}
                  />
                </div>
              ) : null}
              <SummaryCard card={card} locale={locale} />
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs font-semibold text-black/50">
        {locale === "es"
          ? "Las decisiones que sigues se guardan solo en este navegador."
          : "Decisions you follow are saved only on this browser."}
      </p>
    </div>
  );
}
