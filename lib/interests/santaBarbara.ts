export const SANTA_BARBARA_INTEREST_JURISDICTION = "santa-barbara-county";
export const SANTA_BARBARA_INTEREST_DEVICE_STORAGE_KEY =
  "simplecity.santa-barbara.interest-device.v1";
export const SANTA_BARBARA_SAVED_INTERESTS_STORAGE_KEY =
  "simplecity.santa-barbara.saved-interests.v1";
export const SANTA_BARBARA_INTEREST_CHANGE_EVENT =
  "simplecity:santa-barbara-interest-change";
export const MAX_SAVED_SANTA_BARBARA_INTERESTS = 100;

export type SavedSantaBarbaraInterest = {
  cardId: string;
  title: string;
  meetingDate: string;
  savedAt: string;
  lastSeenActivityAt: string | null;
  lastSeenMeetingStatus: string | null;
};

export type SantaBarbaraInterestCardUpdate = {
  cardId: string;
  latestActivityAt: string | null;
  hasResult: boolean;
  meetingStatus: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isInterestUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function latestIsoTimestamp(...values: Array<string | null | undefined>) {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isNaN(time) || time <= latestTime) continue;
    latest = value;
    latestTime = time;
  }

  return latest;
}

function normalizeSavedInterest(value: unknown): SavedSantaBarbaraInterest | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<SavedSantaBarbaraInterest>;
  if (!isInterestUuid(row.cardId) || typeof row.title !== "string") return null;

  return {
    cardId: row.cardId,
    title: row.title.trim().slice(0, 500),
    meetingDate: typeof row.meetingDate === "string" ? row.meetingDate.slice(0, 120) : "",
    savedAt:
      typeof row.savedAt === "string" && !Number.isNaN(Date.parse(row.savedAt))
        ? row.savedAt
        : new Date(0).toISOString(),
    lastSeenActivityAt:
      typeof row.lastSeenActivityAt === "string" &&
      !Number.isNaN(Date.parse(row.lastSeenActivityAt))
        ? row.lastSeenActivityAt
        : null,
    lastSeenMeetingStatus:
      typeof row.lastSeenMeetingStatus === "string"
        ? row.lastSeenMeetingStatus.slice(0, 80)
        : null
  };
}

export function parseSavedSantaBarbaraInterests(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const interests: SavedSantaBarbaraInterest[] = [];
    for (const value of parsed) {
      const interest = normalizeSavedInterest(value);
      if (!interest || seen.has(interest.cardId)) continue;
      seen.add(interest.cardId);
      interests.push(interest);
      if (interests.length >= MAX_SAVED_SANTA_BARBARA_INTERESTS) break;
    }
    return interests;
  } catch {
    return [];
  }
}

export function hasInterestUpdate(
  interest: SavedSantaBarbaraInterest,
  update: SantaBarbaraInterestCardUpdate | undefined
) {
  if (!update) return false;
  const current = Date.parse(update.latestActivityAt || "");
  const seen = Date.parse(interest.lastSeenActivityAt || interest.savedAt);
  const activityChanged = !Number.isNaN(current) && !Number.isNaN(seen) && current > seen;
  const statusChanged = Boolean(
    interest.lastSeenMeetingStatus &&
      update.meetingStatus &&
      interest.lastSeenMeetingStatus !== update.meetingStatus
  );
  return activityChanged || statusChanged;
}
