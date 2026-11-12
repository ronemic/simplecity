import assert from "node:assert/strict";
import test from "node:test";
import { orderSummaryTargets } from "@/lib/pipeline";

function target(name: string, dateText: string | null, timeText: string | null = null) {
  return { name, meeting: { dateText, timeText } };
}

const NOW = Date.parse("2026-11-12T20:00:00Z");

test("upcoming meetings are summarized first, soonest first, then past meetings newest first", () => {
  const ordered = orderSummaryTargets(
    [
      target("past-old", "October 6, 2026", "6:00 PM"),
      target("upcoming-far", "December 1, 2026", "9:00 AM"),
      target("undated", null),
      target("past-recent", "November 10, 2026", "6:00 PM"),
      target("upcoming-soon", "November 13, 2026", "6:00 PM")
    ],
    NOW
  );

  assert.deepEqual(
    ordered.map((item) => item.name),
    ["upcoming-soon", "upcoming-far", "past-recent", "past-old", "undated"]
  );
});

test("queue ordering keeps every meeting and preserves scrape order for ties", () => {
  const targets = [
    target("a", "November 17, 2026", "9:00 AM"),
    target("unparseable-1", "TBD"),
    target("b", "November 17, 2026", "9:00 AM"),
    target("unparseable-2", ""),
    target("c", "November 17, 2026", "9:00 AM")
  ];
  const ordered = orderSummaryTargets(targets, NOW);

  assert.deepEqual(ordered.map((item) => item.name), ["a", "b", "c", "unparseable-1", "unparseable-2"]);
  assert.equal(new Set(ordered).size, targets.length);
  assert.equal(targets[1].name, "unparseable-1", "the input array is not reordered in place");
});

test("a time already contained in the date text is not appended twice", () => {
  const ordered = orderSummaryTargets(
    [
      target("later", "November 13, 2026 7:00 PM", "7:00 PM"),
      target("earlier", "November 13, 2026 9:00 AM", "9:00 AM")
    ],
    NOW
  );
  assert.deepEqual(ordered.map((item) => item.name), ["earlier", "later"]);
});
