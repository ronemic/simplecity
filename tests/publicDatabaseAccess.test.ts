import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260720020000_restrict_public_column_access.sql",
    import.meta.url
  ),
  "utf8"
);
const fullBootstrap = readFileSync(
  new URL("../supabase/bootstrap_full.sql", import.meta.url),
  "utf8"
);
const countyBootstrap = readFileSync(
  new URL("../supabase/bootstrap_county.sql", import.meta.url),
  "utf8"
);
const jurisdictionsSecurityMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260721010000_secure_jurisdictions_table.sql",
    import.meta.url
  ),
  "utf8"
);

function grantedColumns(table: string) {
  const match = migration.match(
    new RegExp(`grant select \\(([\\s\\S]*?)\\)\\s*on table public\\.${table}\\s`, "i")
  );
  assert.ok(match, `missing public column grant for ${table}`);
  return new Set(
    match[1]
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean)
  );
}

test("public database grants revoke table-wide reads before allowing safe columns", () => {
  assert.match(
    migration,
    /add column if not exists decision_sort_at timestamptz/i,
    "security migration must also repair older regional schemas"
  );
  assert.match(
    migration,
    /revoke select on table[\s\S]*public\.meetings[\s\S]*public\.decision_outcome_translations[\s\S]*from anon, authenticated;/i
  );

  const forbiddenColumns: Record<string, string[]> = {
    meetings: [
      "external_id",
      "row_text",
      "llm_input_text",
      "source_hash",
      "summarized_source_hash",
      "cards_generated_at",
      "extraction_notes",
      "raw"
    ],
    documents: [
      "local_path",
      "storage_path",
      "bytes",
      "download_error",
      "extracted_text"
    ],
    summary_cards: ["source_item_id", "admin_notes", "raw_llm_json"],
    meeting_translations: ["raw_llm_json"],
    summary_card_translations: ["raw_llm_json"],
    decision_outcomes: [
      "source_hash",
      "source_text",
      "matched_item_key",
      "match_method",
      "match_score"
    ],
    decision_outcome_translations: ["raw_llm_json"]
  };

  for (const [table, columns] of Object.entries(forbiddenColumns)) {
    const granted = grantedColumns(table);
    for (const column of columns) {
      assert.equal(granted.has(column), false, `${table}.${column} must remain private`);
    }
  }
});

test("new database bootstraps include the same restricted public grants", () => {
  const firstStatement = "revoke select on table";
  const lastStatement = "on table public.decision_outcome_translations\nto anon, authenticated;";

  for (const [name, bootstrap] of [
    ["full", fullBootstrap],
    ["county", countyBootstrap]
  ] as const) {
    const restrictionStart = bootstrap.lastIndexOf(firstStatement);
    const restrictionEnd = bootstrap.lastIndexOf(lastStatement);
    assert.ok(restrictionStart >= 0, `${name} bootstrap must revoke broad public reads`);
    assert.ok(restrictionEnd > restrictionStart, `${name} bootstrap must restore safe column reads`);
  }
});

test("public rendering reads internal meeting raw data only through a service client", () => {
  const source = readFileSync(new URL("../lib/db/queries.ts", import.meta.url), "utf8");
  const functionSource = source.match(
    /export async function getMeetingRawVideoDocuments[\s\S]*?\n}\n\nexport async function getCategoryCards/
  )?.[0];

  assert.ok(functionSource);
  assert.match(functionSource, /getSafeServiceClients/);
  assert.doesNotMatch(functionSource, /getSafePublicClients/);
  assert.doesNotMatch(source, /\.select\("summary_card_id,raw_llm_json"\)/);
});

test("jurisdictions lookup data is protected by RLS and narrow public grants", () => {
  assert.match(
    jurisdictionsSecurityMigration,
    /alter table public\.jurisdictions enable row level security;/i
  );
  assert.match(
    jurisdictionsSecurityMigration,
    /create policy "Jurisdictions are publicly readable"[\s\S]*for select[\s\S]*to anon, authenticated[\s\S]*using \(true\);/i
  );
  assert.match(
    jurisdictionsSecurityMigration,
    /revoke all privileges on table public\.jurisdictions[\s\S]*from anon, authenticated;/i
  );

  const grant = jurisdictionsSecurityMigration.match(
    /grant select \(([\s\S]*?)\)\s*on table public\.jurisdictions\s*to anon, authenticated;/i
  );
  assert.ok(grant);
  assert.deepEqual(
    grant[1].split(",").map((column) => column.trim()),
    ["slug", "name", "region_slug"]
  );
});
