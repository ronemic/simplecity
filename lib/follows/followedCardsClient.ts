import {
  FOLLOWED_CARDS_CHANGE_EVENT,
  FOLLOWED_CARDS_STORAGE_KEY,
  MAX_FOLLOWED_CARDS,
  parseFollowedCards,
  type FollowedCard
} from "@/lib/follows/followedCards";

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readFollowedCards(storage: Storage | null = browserStorage()) {
  if (!storage) return [];
  try {
    return parseFollowedCards(storage.getItem(FOLLOWED_CARDS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeFollowedCards(
  follows: FollowedCard[],
  storage: Storage | null = browserStorage()
) {
  if (!storage) return false;
  try {
    storage.setItem(
      FOLLOWED_CARDS_STORAGE_KEY,
      JSON.stringify(follows.slice(0, MAX_FOLLOWED_CARDS))
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FOLLOWED_CARDS_CHANGE_EVENT));
    }
    return true;
  } catch {
    return false;
  }
}

export function followCard(
  cardId: string,
  title: string,
  storage: Storage | null = browserStorage()
) {
  const now = new Date().toISOString();
  const others = readFollowedCards(storage).filter((follow) => follow.cardId !== cardId);
  if (others.length >= MAX_FOLLOWED_CARDS) return false;
  return writeFollowedCards(
    [{ cardId, title, followedAt: now, lastSeenAt: now }, ...others],
    storage
  );
}

export function unfollowCard(cardId: string, storage: Storage | null = browserStorage()) {
  return writeFollowedCards(
    readFollowedCards(storage).filter((follow) => follow.cardId !== cardId),
    storage
  );
}

/**
 * Marks each followed card's events as seen through the given time, which is
 * the newest event the reader was actually shown -- not "now", since a cached
 * page can lag behind events recorded in the meantime.
 */
export function markFollowedCardsSeen(
  seenThroughByCard: Record<string, string | null>,
  storage: Storage | null = browserStorage()
) {
  const follows = readFollowedCards(storage);
  let changed = false;
  const next = follows.map((follow) => {
    const seenThrough = seenThroughByCard[follow.cardId];
    if (!seenThrough || Date.parse(seenThrough) <= Date.parse(follow.lastSeenAt)) return follow;
    changed = true;
    return { ...follow, lastSeenAt: seenThrough };
  });
  return changed ? writeFollowedCards(next, storage) : false;
}
