import assert from "node:assert/strict";
import test from "node:test";
import { readAllPages } from "@/lib/db/readAllPages";

test("reads matches beyond the first 1,000 even when the server caps ranges at 500", async () => {
  const ids = Array.from({ length: 1205 }, (_, index) => index);
  const offsets: number[] = [];
  const rows = await readAllPages((from, to) => {
    offsets.push(from);
    return Promise.resolve({ data: ids.slice(from, Math.min(to + 1, from + 500)), error: null });
  });

  assert.equal(rows.length, 1205);
  assert.equal(rows[1000], 1000);
  assert.deepEqual(offsets, [0, 500, 1000, 1205]);
});

test("does not silently return a partial search result after a later page fails", async () => {
  await assert.rejects(
    readAllPages((from) => Promise.resolve(from === 0
      ? { data: Array.from({ length: 1000 }, (_, index) => index), error: null }
      : { data: null, error: { message: "database unavailable" } })),
    /database unavailable/
  );
});
