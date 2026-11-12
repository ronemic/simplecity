import assert from "node:assert/strict";
import test from "node:test";
import { VersionedCache } from "@/lib/db/versionedCache";

function harness(options: { checkIntervalMs?: number; maxAgeMs?: number } = {}) {
  const state = { now: 0, version: "v1", loads: 0, versionReads: 0, failLoad: false, failVersion: false };
  const logs: string[] = [];
  const cache = new VersionedCache<string>({
    checkIntervalMs: options.checkIntervalMs ?? 100,
    maxAgeMs: options.maxAgeMs ?? 10_000,
    now: () => state.now,
    log: (message) => logs.push(message)
  });
  const source = {
    version: async () => {
      state.versionReads += 1;
      if (state.failVersion) throw new Error("version unavailable");
      return state.version;
    },
    load: async () => {
      state.loads += 1;
      if (state.failLoad) throw new Error("load failed");
      return `${state.version}#${state.loads}`;
    }
  };
  return { cache, source, state, logs };
}

test("loads once and reuses the value without re-checking inside the interval", async () => {
  const { cache, source, state } = harness();
  assert.equal(await cache.get("k", source), "v1#1");
  state.now = 99;
  assert.equal(await cache.get("k", source), "v1#1");
  assert.equal(state.loads, 1);
  assert.equal(state.versionReads, 1);
});

test("after the interval an unchanged version keeps the value without reloading", async () => {
  const { cache, source, state } = harness();
  await cache.get("k", source);
  state.now = 150;
  assert.equal(await cache.get("k", source), "v1#1");
  assert.equal(state.loads, 1);
  assert.equal(state.versionReads, 2);
  state.now = 200;
  await cache.get("k", source);
  assert.equal(state.versionReads, 2, "the successful check starts a new interval");
});

test("a changed version rebuilds before answering", async () => {
  const { cache, source, state } = harness();
  await cache.get("k", source);
  state.version = "v2";
  state.now = 50;
  assert.equal(await cache.get("k", source), "v1#1", "not checked inside the interval");
  state.now = 150;
  assert.equal(await cache.get("k", source), "v2#2");
});

test("concurrent first reads share one load, and keys are independent", async () => {
  const { cache, source, state } = harness();
  const values = await Promise.all([cache.get("a", source), cache.get("a", source), cache.get("b", source)]);
  assert.deepEqual(values, ["v1#1", "v1#1", "v1#2"]);
  assert.equal(state.loads, 2);
});

test("concurrent stale reads share one version check and one rebuild", async () => {
  const { cache, source, state } = harness();
  await cache.get("k", source);
  state.version = "v2";
  state.now = 150;
  const values = await Promise.all([cache.get("k", source), cache.get("k", source), cache.get("k", source)]);
  assert.deepEqual(values, ["v2#2", "v2#2", "v2#2"]);
  assert.equal(state.loads, 2);
});

test("a first load that fails is reported, not cached", async () => {
  const { cache, source, state } = harness();
  state.failLoad = true;
  await assert.rejects(cache.get("k", source), /load failed/);
  state.failLoad = false;
  assert.equal(await cache.get("k", source), "v1#2");
});

test("a failed rebuild keeps serving the previous value and backs off for an interval", async () => {
  const { cache, source, state, logs } = harness();
  await cache.get("k", source);
  state.version = "v2";
  state.failLoad = true;
  state.now = 150;
  assert.equal(await cache.get("k", source), "v1#1");
  assert.equal(logs.length, 1);
  const loadsAfterFailure = state.loads;
  state.now = 200;
  assert.equal(await cache.get("k", source), "v1#1");
  assert.equal(state.loads, loadsAfterFailure, "no retry inside the interval");
  state.failLoad = false;
  state.now = 260;
  assert.equal(await cache.get("k", source), `v2#${loadsAfterFailure + 1}`);
});

test("an unreadable version forces a rebuild instead of trusting the old value", async () => {
  const { cache, source, state } = harness();
  await cache.get("k", source);
  state.failVersion = true;
  state.now = 150;
  assert.equal(await cache.get("k", source), "v1#2");
  state.failVersion = false;
  state.now = 300;
  assert.equal(await cache.get("k", source), "v1#3", "a value built without a version is rebuilt at the next check");
});

test("an old value is refreshed in the background while readers get it immediately", async () => {
  const { cache, source, state } = harness({ maxAgeMs: 1_000 });
  await cache.get("k", source);
  state.now = 1_050;
  assert.equal(await cache.get("k", source), "v1#1");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(state.loads, 2);
  assert.equal(await cache.get("k", source), "v1#2");
});
