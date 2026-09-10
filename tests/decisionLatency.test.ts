import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Exercise the real query module with deterministic database responses and no
// persistent Next cache, so query counts cannot be hidden by a warm cache.
async function queryHarness() {
  const calls: Array<{ table: string; ids: string[]; slug?: string }> = [];
  const slugs = ["foster-city", "los-altos"];
  const rows = slugs.flatMap((slug, city) => Array.from({ length: 6 }, (_, index) => ({
    id: `${slug}-${index}`, jurisdiction_slug: slug, agenda_item: index === 2 ? "Park renovation" : "Road repair",
    category_tags: ["Transportation"], what_is_happening: ["Review the project"],
    why_it_matters: "Residents", who_it_affects: [], is_published: true,
    status: "Upcoming vote", meetings: null,
    created_at: `2026-09-${String(20 - index * 2 - city).padStart(2, "0")}T12:00:00Z`
  })));
  const supabase = {
    from(table: string) {
      const call = { table, ids: [] as string[], slug: undefined as string | undefined };
      let range: [number, number] | undefined;
      const query = {
        select() { return query; },
        eq(column: string, value: string) { if (column === "jurisdiction_slug") call.slug = value; return query; },
        in(column: string, values: string[]) { if (column === "summary_card_id") call.ids = values; return query; },
        not() { return query; }, order() { return query; }, limit() { return query; },
        range(from: number, to: number) { range = [from, to]; return query; },
        maybeSingle() { return query; },
        then(resolve: (value: unknown) => unknown) {
          calls.push(call);
          if (table === "decision_outcomes") {
            return Promise.resolve(resolve({ data: call.ids.length
              ? call.ids.map((id) => ({ summary_card_id: id, kind: "approved", headline: "Approved" }))
              : { decided_at: "2026-09-01" }, error: null }));
          }
          const matching = rows.filter((row) => row.jurisdiction_slug === call.slug);
          return Promise.resolve(resolve({ data: range ? matching.slice(range[0], range[1] + 1) : matching,
            count: matching.length, error: null }));
        }
      };
      return query;
    }
  };
  const file = new URL("../lib/db/queries.ts", import.meta.url);
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const dependencies = new Map<string, unknown>();
  for (const [, name] of source.matchAll(/require\("([^"]+)"\)/g)) {
    if (dependencies.has(name)) continue;
    if (name === "next/cache") {
      dependencies.set(name, { unstable_cache: (fn: unknown) => fn });
      continue;
    }
    const dependency = await import(name.startsWith("@/") ? new URL(`../${name.slice(2)}.ts`, import.meta.url).href : name);
    if (name === "@/lib/config/jurisdictions") {
      const jurisdictions = dependency.getJurisdictions().filter((item: { slug: string }) => slugs.includes(item.slug));
      const selected = (selection: string) => jurisdictions.filter((item: { slug: string }) => selection === "all" || item.slug === selection);
      dependencies.set(name, { ...dependency,
        getPublicSupabaseClientsForSelection: (selection: string) => selected(selection).map((jurisdiction: unknown) => ({ jurisdiction, supabase })),
        getPublicSupabaseProjectsForSelection: (selection: string) => [{ jurisdictions: selected(selection), supabase }]
      });
    } else dependencies.set(name, dependency);
  }
  const queryModule = { exports: {} as typeof import("@/lib/db/queries") };
  new Function("require", "module", "exports", source)((name: string) => dependencies.get(name), queryModule, queryModule.exports);
  return { queries: queryModule.exports, calls };
}

test("aggregate pagination enriches only the displayed rows, once per database", async () => {
  const { queries, calls } = await queryHarness();
  const result = await queries.getDecisionCardPage({ jurisdiction: "all", page: 2, pageSize: 2 });
  assert.deepEqual(result.cards.map((card) => card.id), ["foster-city-1", "los-altos-1"]);
  assert.equal(result.totalCount, 12);
  assert.equal(result.pageCount, 6);
  assert.ok(result.cards.every((card) => card.outcome?.kind === "approved"));
  assert.deepEqual(calls.filter((call) => call.table === "decision_outcomes").map((call) => call.ids),
    [["foster-city-1", "los-altos-1"]]);
});

test("search preserves matches and loads outcomes only for its displayed page", async () => {
  const { queries, calls } = await queryHarness();
  const result = await queries.getDecisionCardPage({ jurisdiction: "all", search: "park", pageSize: 1 });
  assert.equal(result.totalCount, 2);
  assert.equal(result.cards[0].id, "foster-city-2");
  assert.equal(result.cards[0].outcome?.kind, "approved");
  assert.deepEqual(calls.filter((call) => call.table === "decision_outcomes").map((call) => call.ids), [["foster-city-2"]]);
});

test("result filtering retains outcomes and correct counts", async () => {
  const { queries } = await queryHarness();
  const result = await queries.getDecisionCardPage({ jurisdiction: "all", search: "park", result: "approved", pageSize: 1 });
  assert.equal(result.totalCount, 2);
  assert.equal(result.cards[0].outcome?.kind, "approved");
});

test("single-city freshness never queries unrelated jurisdictions", async () => {
  const { queries, calls } = await queryHarness();
  const result = await queries.getDecisionResultFreshness("", "los-altos");
  assert.deepEqual(Object.keys(result), ["los-altos"]);
  assert.deepEqual(calls.map((call) => call.slug), ["los-altos"]);
});
