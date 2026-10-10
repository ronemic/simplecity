"use client";

import { Bell, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { FOLLOWED_CARDS_CHANGE_EVENT, MAX_FOLLOWED_CARDS } from "@/lib/follows/followedCards";
import { followCard, readFollowedCards, unfollowCard } from "@/lib/follows/followedCardsClient";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

export function FollowButton({
  cardId,
  title,
  locale
}: {
  cardId: string;
  title: string;
  locale: Locale;
}) {
  const [following, setFollowing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function sync() {
      setFollowing(readFollowedCards().some((follow) => follow.cardId === cardId));
      setLoaded(true);
    }

    sync();
    window.addEventListener(FOLLOWED_CARDS_CHANGE_EVENT, sync);
    // Another tab following or unfollowing should show up here too.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FOLLOWED_CARDS_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [cardId]);

  function toggleFollow() {
    setError("");
    if (following) {
      if (!unfollowCard(cardId)) setError(storageError(locale));
      return;
    }

    if (readFollowedCards().length >= MAX_FOLLOWED_CARDS) {
      setError(
        locale === "es"
          ? `Puedes seguir hasta ${MAX_FOLLOWED_CARDS} decisiones. Deja de seguir alguna primero.`
          : `You can follow up to ${MAX_FOLLOWED_CARDS} decisions. Unfollow one first.`
      );
      return;
    }
    if (!followCard(cardId, title)) setError(storageError(locale));
  }

  const idleLabel = locale === "es" ? "Seguir" : "Follow";
  const activeLabel = locale === "es" ? "Siguiendo" : "Following";
  const Icon = following ? BellRing : Bell;

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-pressed={following}
        disabled={!loaded}
        onClick={toggleFollow}
        className={cn(
          "action-secondary-sm decision-card-action",
          following && "!border-civic/35 !bg-civic/10 !text-civic"
        )}
        title={
          locale === "es"
            ? "Guardado en este navegador. Ve los cambios en Siguiendo."
            : "Saved on this browser. See changes under Following."
        }
      >
        <Icon aria-hidden className="h-4 w-4" />
        {/* Both labels share one grid cell so toggling never reflows the row. */}
        <span className="grid">
          <span className="invisible col-start-1 row-start-1" aria-hidden>
            {activeLabel.length > idleLabel.length ? activeLabel : idleLabel}
          </span>
          <span className="col-start-1 row-start-1">{following ? activeLabel : idleLabel}</span>
        </span>
      </button>
      {error ? (
        <p className="mt-1.5 text-xs font-bold leading-5 text-[#9f2a20]" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function storageError(locale: Locale) {
  return locale === "es"
    ? "Tu navegador bloqueó el almacenamiento necesario para seguir decisiones."
    : "Your browser blocked the storage needed to follow decisions.";
}
