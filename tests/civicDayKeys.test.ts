import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { CIVIC_TIME_ZONE, civicCalendarDay, parseMeetingDate } from "@/lib/utils/date";

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.isFile() && /\.tsx?$/.test(entry.name) ? [full] : [];
    })
  );
  return files.flat();
}

test("civicCalendarDay returns the Pacific day, not the UTC day", () => {
  // 6pm Pacific is already the next day in UTC. This is the whole reason the
  // helper exists: a day key built by slicing the ISO string reported Jun 9 for a
  // Jun 8 evening council meeting, so minutes never matched their meeting.
  const eveningIso = parseMeetingDate("6/8/2026 6:00:00 PM");
  assert.ok(eveningIso);
  assert.equal((eveningIso as string).slice(0, 10), "2026-06-09", "precondition: UTC day differs");
  assert.equal(civicCalendarDay("6/8/2026 6:00:00 PM"), "2026-06-08");
});

test("a bare date and the same date with an evening time share one day key", () => {
  // Archive labels carry a bare date while meeting rows carry a time. Both sides
  // of a same-day comparison have to agree.
  assert.equal(civicCalendarDay("6/8/2026"), civicCalendarDay("6/8/2026 6:00:00 PM"));
  assert.equal(civicCalendarDay("Jun 8, 2026"), civicCalendarDay("6/8/2026 11:30 PM"));
});

test("day keys hold across a daylight-saving boundary", () => {
  assert.equal(civicCalendarDay("11/3/2026 7:00 PM"), "2026-11-03");
  assert.equal(civicCalendarDay("3/10/2026 7:00 PM"), "2026-03-10");
});

test("unparseable input yields no day key", () => {
  assert.equal(civicCalendarDay(""), null);
  assert.equal(civicCalendarDay("date to be determined"), null);
});

test("civicCalendarDay agrees with an explicit Pacific formatter", () => {
  for (const text of [
    "6/8/2026 6:00:00 PM",
    "8/13/2026 1:00:00 PM",
    "Aug 18, 2026 06:00 PM",
    "12/31/2026 11:59 PM"
  ]) {
    const iso = parseMeetingDate(text);
    assert.ok(iso, `expected ${text} to parse`);
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: CIVIC_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(iso as string));
    assert.equal(civicCalendarDay(text), expected, text);
  }
});

/**
 * Guards against the bug returning by a different hand.
 *
 * Slicing a parsed timestamp looks like a harmless way to get a date, and it is
 * wrong for every Pacific evening meeting. It was reintroduced independently in
 * four scrapers, so the pattern itself is banned rather than only its instances.
 */
test("no source file derives a day key by slicing a parsed timestamp", async () => {
  const roots = ["lib", "app", "components", "scripts"];
  const offenders: string[] = [];

  for (const root of roots) {
    for (const file of await sourceFiles(root)) {
      const contents = await readFile(file, "utf8");
      contents.split("\n").forEach((line, index) => {
        if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
        if (/parseMeetingDate\([^)]*\)\s*\??\.slice\(\s*0\s*,\s*10\s*\)/.test(line)) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Use civicCalendarDay() instead — slicing a parsed timestamp yields the UTC day:\n  ${offenders.join("\n  ")}`
  );
});
