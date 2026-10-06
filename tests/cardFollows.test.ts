import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cardEventLabel,
  cardEventsRecordedAfter,
  latestCardEventRecordedAt,
  sortCardEvents,
  type CardEvent
} from "@/lib/cardEvents";
import { MAX_FOLLOWED_CARDS, parseFollowedCards } from "@/lib/follows/followedCards";
import {
  followCard,
  markFollowedCardsSeen,
  readFollowedCards,
  unfollowCard
} from "@/lib/follows/followedCardsClient";

const CARD_A = "11111111-1111-4111-8111-111111111111";
const CARD_B = "22222222-2222-4222-8222-222222222222";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value)
  };
}

function event(overrides: Partial<CardEvent>): CardEvent {
  return {
    id: "e1",
    summary_card_id: CARD_A,
    kind: "posted",
    previous_value: null,
    new_value: null,
    occurred_at: "2026-09-01T17:00:00.000Z",
    created_at: "2026-09-01T17:00:00.000Z",
    ...overrides
  };
}

test("parseFollowedCards drops invalid and duplicate entries", () => {
  const follows = parseFollowedCards(
    JSON.stringify([
      { cardId: CARD_A, title: "Budget", followedAt: "2026-09-01T00:00:00.000Z" },
      { cardId: CARD_A, title: "Duplicate" },
      { cardId: "not-a-uuid", title: "Bad" },
      "junk"
    ])
  );

  assert.equal(follows.length, 1);
  assert.equal(follows[0].title, "Budget");
  // A missing lastSeenAt falls back to when the card was followed.
  assert.equal(follows[0].lastSeenAt, "2026-09-01T00:00:00.000Z");
  assert.deepEqual(parseFollowedCards("{not json"), []);
});

test("follow, unfollow and the follow limit", () => {
  const storage = memoryStorage();
  assert.equal(followCard(CARD_A, "Budget", storage), true);
  assert.equal(followCard(CARD_B, "Parks", storage), true);
  assert.deepEqual(
    readFollowedCards(storage).map((follow) => follow.cardId),
    [CARD_B, CARD_A]
  );

  unfollowCard(CARD_A, storage);
  assert.deepEqual(readFollowedCards(storage).map((follow) => follow.cardId), [CARD_B]);

  const full = memoryStorage();
  const ids = Array.from({ length: MAX_FOLLOWED_CARDS }, (_, index) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
  );
  for (const id of ids) followCard(id, "x", full);
  assert.equal(followCard(CARD_A, "One too many", full), false);
});

test("only events recorded after the last visit count as new", () => {
  const events = [
    // Decided long ago but recorded just now: still news to the follower.
    event({
      id: "outcome",
      kind: "outcome_recorded",
      occurred_at: "2026-08-01T00:00:00.000Z",
      created_at: "2026-09-10T00:00:00.000Z"
    }),
    event({ id: "posted", created_at: "2026-08-01T00:00:00.000Z" })
  ];

  assert.deepEqual(
    cardEventsRecordedAfter(events, "2026-09-01T00:00:00.000Z").map((item) => item.id),
    ["outcome"]
  );
  assert.equal(latestCardEventRecordedAt(events), "2026-09-10T00:00:00.000Z");
  // The timeline orders by when things happened, not when they were recorded.
  assert.deepEqual(sortCardEvents(events).map((item) => item.id), ["outcome", "posted"]);
});

test("marking seen only moves lastSeenAt forward", () => {
  const storage = memoryStorage();
  followCard(CARD_A, "Budget", storage);
  const followedAt = readFollowedCards(storage)[0].lastSeenAt;

  assert.equal(markFollowedCardsSeen({ [CARD_A]: "2000-01-01T00:00:00.000Z" }, storage), false);
  assert.equal(readFollowedCards(storage)[0].lastSeenAt, followedAt);

  assert.equal(markFollowedCardsSeen({ [CARD_A]: "2999-01-01T00:00:00.000Z" }, storage), true);
  assert.equal(readFollowedCards(storage)[0].lastSeenAt, "2999-01-01T00:00:00.000Z");
});

test("event labels name the change in both languages", () => {
  const changed = event({ kind: "outcome_changed", previous_value: "continued", new_value: "approved" });
  assert.equal(cardEventLabel(changed, "en"), "Official result changed from Continued to Approved");
  assert.equal(cardEventLabel(changed, "es"), "Resultado oficial cambiado de Aplazada a Aprobada");
  assert.equal(
    cardEventLabel(event({ kind: "status_changed", previous_value: "Upcoming vote", new_value: "Tabled" }), "en"),
    "Status changed from Upcoming vote to Tabled"
  );
  assert.equal(
    cardEventLabel(event({ kind: "outcome_vote_changed", previous_value: "4-1", new_value: "5-0" }), "en"),
    "Official vote corrected from 4-1 to 5-0"
  );
  assert.equal(
    cardEventLabel(event({ kind: "outcome_vote_changed", previous_value: null, new_value: "5-0" }), "es"),
    "Votación oficial agregada: 5-0"
  );
  assert.equal(
    cardEventLabel(event({
      kind: "meeting_rescheduled",
      previous_value: "2026-10-04T17:00:00Z",
      new_value: "2026-10-05T18:30:00Z"
    }), "en"),
    "Meeting rescheduled from Oct 4, 2026, 10:00 AM PT to Oct 5, 2026, 11:30 AM PT"
  );
  assert.equal(
    cardEventLabel(event({
      kind: "meeting_rescheduled",
      previous_value: "October 4, 2026",
      new_value: "October 5, 2026"
    }), "en"),
    "Meeting rescheduled from October 4, 2026 to October 5, 2026"
  );
  assert.match(
    cardEventLabel(event({
      kind: "outcome_date_changed",
      previous_value: "2026-10-04T17:00:00Z",
      new_value: "2026-10-05T17:00:00Z"
    }), "es"),
    /^Fecha de la decisión corregida de .+ a .+$/
  );
});

test("card_events migration logs only real changes and exposes safe columns", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20261004000000_add_card_events.sql", import.meta.url),
    "utf8"
  );

  assert.match(migration, /after insert or update of status on public\.summary_cards/i);
  assert.match(migration, /after insert or update of kind on public\.decision_outcomes/i);
  assert.match(migration, /after update of status on public\.meetings/i);
  // Reclassifying a pending item is summarizer noise, not news.
  assert.match(
    migration,
    /not \(public\.card_status_is_pending\(old\.status\) and public\.card_status_is_pending\(new\.status\)\)/i
  );
  assert.match(migration, /alter table public\.card_events enable row level security;/i);
  assert.match(migration, /revoke all privileges on table public\.card_events from public, anon, authenticated;/i);

  for (const path of ["../supabase/bootstrap_full.sql", "../supabase/bootstrap_county.sql"]) {
    const bootstrap = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(bootstrap, /create table if not exists public\.card_events/i, path);
    assert.doesNotMatch(bootstrap, /Seed history for existing cards/i, `${path} must not touch row data`);
  }
});

test("follow-up migration watches material schedule and outcome corrections", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20261004010000_log_schedule_and_outcome_corrections.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /after insert or update of kind, vote, decided_at on public\.decision_outcomes/i);
  assert.match(migration, /after update of status, meeting_datetime, date_text, time_text on public\.meetings/i);
  assert.match(migration, /old\.meeting_datetime is distinct from new\.meeting_datetime/i);
  assert.match(migration, /btrim\(new\.vote\).*distinct from.*btrim\(old\.vote\)/i);
  assert.match(migration, /new\.decided_at is distinct from old\.decided_at/i);
  assert.doesNotMatch(migration, /new\.(?:summary|headline) is distinct from old\.(?:summary|headline)/i);

  for (const path of ["../supabase/bootstrap_full.sql", "../supabase/bootstrap_county.sql"]) {
    const bootstrap = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(bootstrap, /after update of status, meeting_datetime, date_text, time_text on public\.meetings/i, path);
    assert.match(bootstrap, /after insert or update of kind, vote, decided_at on public\.decision_outcomes/i, path);
  }
});
