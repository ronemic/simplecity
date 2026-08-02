import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260802000000_add_los_altos_hills_jurisdiction.sql",
    import.meta.url
  ),
  "utf8"
);
const bootstrap = readFileSync(
  new URL("../supabase/bootstrap_full.sql", import.meta.url),
  "utf8"
);
const workflow = readFileSync(
  new URL("../.github/workflows/nightly-scrapers.yml", import.meta.url),
  "utf8"
);
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { scripts: Record<string, string> };

test("Los Altos Hills migration and bootstrap target the Santa Clara region", () => {
  for (const sql of [migration, bootstrap]) {
    assert.match(sql, /'los-altos-hills',\s*'Los Altos Hills',\s*'santa-clara'/);
  }
  assert.match(migration, /on conflict \(slug\) do update/i);
});

test("Los Altos Hills has scraper, pipeline, and scheduled workflow entry points", () => {
  assert.match(packageJson.scripts["scrape:los-altos-hills"], /--jurisdiction=los-altos-hills/);
  assert.match(packageJson.scripts["pipeline:los-altos-hills"], /--jurisdiction=los-altos-hills/);
  assert.match(workflow, /group: nightly-scraper-los-altos-hills/);
  assert.match(workflow, /npm run pipeline:los-altos-hills/);
  assert.match(workflow, /--require-results-coverage/);
  assert.match(workflow, /LOS_ALTOS_HILLS_CIVICCLERK_URL:\s*https:\/\/losaltoshillsca\.portal\.civicclerk\.com\//);
});
