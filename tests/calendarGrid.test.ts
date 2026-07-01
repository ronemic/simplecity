import assert from "node:assert/strict";
import test from "node:test";
import {
  addMonths,
  buildMonthDays,
  firstDateInMonth,
  isDateVisibleInMonthGrid
} from "@/lib/utils/calendarGrid";

test("includes trailing previous-month dates in the next month grid", () => {
  assert.deepEqual(buildMonthDays("2026-07").slice(0, 3), [
    "2026-06-28",
    "2026-06-29",
    "2026-06-30"
  ]);
  assert.equal(isDateVisibleInMonthGrid("2026-07", "2026-06-30"), true);
});

test("does not keep an end-of-month active date when next month only shows it as a muted day", () => {
  const nextMonth = addMonths("2026-06", 1);

  assert.equal(nextMonth, "2026-07");
  assert.equal(firstDateInMonth(nextMonth, "2026-06-30"), "");
});

test("keeps an active date only when it belongs to the current month", () => {
  assert.equal(firstDateInMonth("2026-07", "2026-07-15"), "2026-07-15");
  assert.equal(firstDateInMonth("2026-07", "2026-06-15"), "");
});

test("falls back to today only when today belongs to the current month", () => {
  assert.equal(firstDateInMonth("2026-07", "2026-06-15", "2026-07-01"), "2026-07-01");
  assert.equal(
    firstDateInMonth("2026-07", "2026-06-15", "2026-06-30"),
    ""
  );
});
