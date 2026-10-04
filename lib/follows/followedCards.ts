export const FOLLOWED_CARDS_STORAGE_KEY = "simplecity.followed-cards.v1";
export const FOLLOWED_CARDS_CHANGE_EVENT = "simplecity:followed-cards-change";
export const MAX_FOLLOWED_CARDS = 50;

export type FollowedCard = {
  cardId: string;
  title: string;
  followedAt: string;
  // Events SimpleCity recorded after this are "new" to this reader.
  lastSeenAt: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCardUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validTimestamp(value: unknown, fallback: string) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function normalizeFollowedCard(value: unknown): FollowedCard | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<FollowedCard>;
  if (!isCardUuid(row.cardId)) return null;

  const followedAt = validTimestamp(row.followedAt, new Date(0).toISOString());
  return {
    cardId: row.cardId,
    title: typeof row.title === "string" ? row.title.trim().slice(0, 500) : "",
    followedAt,
    lastSeenAt: validTimestamp(row.lastSeenAt, followedAt)
  };
}

export function parseFollowedCards(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const follows: FollowedCard[] = [];
    for (const item of parsed) {
      const follow = normalizeFollowedCard(item);
      if (!follow || seen.has(follow.cardId)) continue;
      seen.add(follow.cardId);
      follows.push(follow);
      if (follows.length >= MAX_FOLLOWED_CARDS) break;
    }
    return follows;
  } catch {
    return [];
  }
}
