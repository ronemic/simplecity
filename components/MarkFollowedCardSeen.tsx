"use client";

import { useEffect } from "react";
import { markFollowedCardsSeen } from "@/lib/follows/followedCardsClient";

/** Opening a followed card's page counts as having seen the timeline it shows. */
export function MarkFollowedCardSeen({
  cardId,
  seenThrough
}: {
  cardId: string;
  seenThrough: string | null;
}) {
  useEffect(() => {
    markFollowedCardsSeen({ [cardId]: seenThrough });
  }, [cardId, seenThrough]);

  return null;
}
