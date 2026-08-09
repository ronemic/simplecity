import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isAllowedInterestOrigin } from "@/app/api/interests/santa-barbara/route";
import {
  getOrCreateSantaBarbaraInterestDeviceToken,
  markSantaBarbaraInterestSeen,
  readSavedSantaBarbaraInterests,
  removeSavedSantaBarbaraInterest,
  saveSantaBarbaraInterest
} from "@/lib/interests/santaBarbaraClient";
import {
  hasInterestUpdate,
  latestIsoTimestamp,
  parseSavedSantaBarbaraInterests,
  SANTA_BARBARA_INTEREST_DEVICE_STORAGE_KEY,
  type SavedSantaBarbaraInterest
} from "@/lib/interests/santaBarbara";
import { createDeviceCardHash } from "@/lib/interests/santaBarbaraServer";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const cardOne = "11111111-1111-4111-8111-111111111111";
const cardTwo = "22222222-2222-4222-8222-222222222222";
const deviceToken = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function savedInterest(overrides: Partial<SavedSantaBarbaraInterest> = {}) {
  return {
    cardId: cardOne,
    title: "Housing element update",
    meetingDate: "August 12, 2026",
    savedAt: "2026-08-08T12:00:00.000Z",
    lastSeenActivityAt: "2026-08-08T12:00:00.000Z",
    lastSeenMeetingStatus: "Upcoming",
    ...overrides
  };
}

test("Santa Barbara interest hashes are stable per card but cannot correlate across cards", () => {
  const first = createDeviceCardHash(deviceToken, cardOne, "test-secret");
  const repeated = createDeviceCardHash(deviceToken, cardOne, "test-secret");
  const otherCard = createDeviceCardHash(deviceToken, cardTwo, "test-secret");

  assert.equal(first, repeated);
  assert.notEqual(first, otherCard);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(first, new RegExp(deviceToken));
});

test("same-browser interests can be saved, marked seen, and removed", () => {
  const storage = new MemoryStorage();
  assert.equal(
    getOrCreateSantaBarbaraInterestDeviceToken(storage, () => deviceToken),
    deviceToken
  );
  assert.equal(storage.getItem(SANTA_BARBARA_INTEREST_DEVICE_STORAGE_KEY), deviceToken);

  saveSantaBarbaraInterest(savedInterest(), storage);
  saveSantaBarbaraInterest(savedInterest({ title: "Updated title" }), storage);
  assert.deepEqual(readSavedSantaBarbaraInterests(storage).map((item) => item.title), [
    "Updated title"
  ]);

  markSantaBarbaraInterestSeen(
    cardOne,
    "2026-08-09T12:00:00.000Z",
    "Past",
    storage
  );
  assert.equal(
    readSavedSantaBarbaraInterests(storage)[0].lastSeenActivityAt,
    "2026-08-09T12:00:00.000Z"
  );
  assert.equal(readSavedSantaBarbaraInterests(storage)[0].lastSeenMeetingStatus, "Past");

  removeSavedSantaBarbaraInterest(cardOne, storage);
  assert.deepEqual(readSavedSantaBarbaraInterests(storage), []);
});

test("saved-interest parsing rejects malformed records and detects later activity", () => {
  const interest = savedInterest();
  const parsed = parseSavedSantaBarbaraInterests(
    JSON.stringify([interest, interest, { cardId: "not-a-uuid", title: "Bad" }])
  );
  assert.equal(parsed.length, 1);
  assert.equal(
    hasInterestUpdate(interest, {
      cardId: cardOne,
      latestActivityAt: "2026-08-09T12:00:00.000Z",
      hasResult: true,
      meetingStatus: "Past"
    }),
    true
  );
  assert.equal(
    latestIsoTimestamp("2026-08-08T12:00:00.000Z", "2026-08-09T12:00:00.000Z"),
    "2026-08-09T12:00:00.000Z"
  );
});

test("interest API rejects cross-origin browser writes", () => {
  assert.equal(
    isAllowedInterestOrigin(
      new Request("https://simplecity.app/api/interests/santa-barbara", {
        headers: { Origin: "https://simplecity.app" }
      })
    ),
    true
  );
  assert.equal(
    isAllowedInterestOrigin(
      new Request("https://simplecity.app/api/interests/santa-barbara", {
        headers: { Origin: "https://attacker.example" }
      })
    ),
    false
  );
});

test("interest migration keeps raw signals private and exposes only a service-role aggregate", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260808000000_add_santa_barbara_interest_pilot.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(migration, /alter table public\.decision_interests enable row level security/i);
  assert.match(
    migration,
    /revoke all privileges on table public\.decision_interests from public, anon, authenticated/i
  );
  assert.match(migration, /unique \(summary_card_id, device_card_hash\)/i);
  assert.match(migration, /santa_barbara_decision_interest_totals/i);
  assert.match(
    migration,
    /grant select on table public\.santa_barbara_decision_interest_totals to service_role/i
  );
  assert.doesNotMatch(migration, /\bemail\s+text\b|raw_ip\s+|ip_address\s+/i);
});
