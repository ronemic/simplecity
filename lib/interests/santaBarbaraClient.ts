import {
  MAX_SAVED_SANTA_BARBARA_INTERESTS,
  isInterestUuid,
  parseSavedSantaBarbaraInterests,
  SANTA_BARBARA_INTEREST_CHANGE_EVENT,
  SANTA_BARBARA_INTEREST_DEVICE_STORAGE_KEY,
  SANTA_BARBARA_SAVED_INTERESTS_STORAGE_KEY,
  type SavedSantaBarbaraInterest
} from "@/lib/interests/santaBarbara";

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readSavedSantaBarbaraInterests(storage: Storage | null = browserStorage()) {
  if (!storage) return [];
  try {
    return parseSavedSantaBarbaraInterests(
      storage.getItem(SANTA_BARBARA_SAVED_INTERESTS_STORAGE_KEY)
    );
  } catch {
    return [];
  }
}

export function writeSavedSantaBarbaraInterests(
  interests: SavedSantaBarbaraInterest[],
  storage: Storage | null = browserStorage()
) {
  if (!storage) return false;
  try {
    storage.setItem(
      SANTA_BARBARA_SAVED_INTERESTS_STORAGE_KEY,
      JSON.stringify(interests.slice(0, MAX_SAVED_SANTA_BARBARA_INTERESTS))
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SANTA_BARBARA_INTEREST_CHANGE_EVENT));
    }
    return true;
  } catch {
    return false;
  }
}

export function saveSantaBarbaraInterest(
  interest: SavedSantaBarbaraInterest,
  storage: Storage | null = browserStorage()
) {
  const current = readSavedSantaBarbaraInterests(storage).filter(
    (item) => item.cardId !== interest.cardId
  );
  return writeSavedSantaBarbaraInterests([interest, ...current], storage);
}

export function removeSavedSantaBarbaraInterest(
  cardId: string,
  storage: Storage | null = browserStorage()
) {
  return writeSavedSantaBarbaraInterests(
    readSavedSantaBarbaraInterests(storage).filter((item) => item.cardId !== cardId),
    storage
  );
}

export function markSantaBarbaraInterestSeen(
  cardId: string,
  activityAt: string | null,
  meetingStatus: string | null,
  storage: Storage | null = browserStorage()
) {
  const updated = readSavedSantaBarbaraInterests(storage).map((item) =>
    item.cardId === cardId
      ? {
          ...item,
          lastSeenActivityAt: activityAt,
          lastSeenMeetingStatus: meetingStatus || item.lastSeenMeetingStatus
        }
      : item
  );
  return writeSavedSantaBarbaraInterests(updated, storage);
}

export function getOrCreateSantaBarbaraInterestDeviceToken(
  storage: Storage | null = browserStorage(),
  createUuid: () => string = () => crypto.randomUUID()
) {
  if (!storage) return null;
  try {
    const current = storage.getItem(SANTA_BARBARA_INTEREST_DEVICE_STORAGE_KEY);
    if (isInterestUuid(current)) return current;
    const created = createUuid();
    storage.setItem(SANTA_BARBARA_INTEREST_DEVICE_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}
