import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "@/lib/env/bootstrap";
import {
  getJurisdictionBySlug,
  requireValidJurisdictionSlug,
  type JurisdictionSlug,
  type RegionSlug
} from "@/lib/config/jurisdictions";

type Row = Record<string, unknown>;

const PAGE_SIZE = 500;
const WRITE_CHUNK_SIZE = 100;

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function sourceCredentials(slug: JurisdictionSlug) {
  const values: Record<JurisdictionSlug, [string | undefined, string | undefined]> = {
    "foster-city": [
      process.env.NEXT_PUBLIC_FOSTER_CITY_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.FOSTER_CITY_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    ],
    "san-mateo-city": [
      process.env.NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_URL,
      process.env.SAN_MATEO_CITY_SUPABASE_SERVICE_ROLE_KEY
    ],
    "san-mateo-county": [
      process.env.NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_URL,
      process.env.SAN_MATEO_COUNTY_SUPABASE_SERVICE_ROLE_KEY
    ],
    "mountain-view": [
      process.env.NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_URL,
      process.env.MOUNTAIN_VIEW_SUPABASE_SERVICE_ROLE_KEY
    ],
    "santa-clara-county": [
      process.env.NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_URL,
      process.env.SANTA_CLARA_COUNTY_SUPABASE_SERVICE_ROLE_KEY
    ],
    "san-francisco": [
      process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_URL,
      process.env.SAN_FRANCISCO_SUPABASE_SERVICE_ROLE_KEY
    ],
    "menlo-park": [
      process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_URL,
      process.env.MENLO_PARK_SUPABASE_SERVICE_ROLE_KEY
    ]
  };
  return values[slug];
}

function destinationCredentials(region: RegionSlug) {
  const values: Record<RegionSlug, [string | undefined, string | undefined]> = {
    "north-san-mateo": [
      process.env.NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_URL,
      process.env.NORTH_SAN_MATEO_SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SAN_MATEO_COUNTY_SUPABASE_SERVICE_ROLE_KEY
    ],
    "south-san-mateo": [
      process.env.NEXT_PUBLIC_SOUTH_SAN_MATEO_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_URL,
      process.env.SOUTH_SAN_MATEO_SUPABASE_SERVICE_ROLE_KEY ||
        process.env.MENLO_PARK_SUPABASE_SERVICE_ROLE_KEY
    ],
    "santa-clara": [
      process.env.NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_URL,
      process.env.SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SANTA_CLARA_COUNTY_SUPABASE_SERVICE_ROLE_KEY
    ],
    "san-francisco": [
      process.env.NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_URL,
      process.env.SAN_FRANCISCO_SUPABASE_SERVICE_ROLE_KEY
    ]
  };
  return values[region];
}

function client(credentials: [string | undefined, string | undefined], label: string) {
  return createClient(
    required(credentials[0], `${label} Supabase URL`),
    required(credentials[1], `${label} service role key`),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function readRows(
  supabase: SupabaseClient,
  table: string,
  filter?: { column: string; value: string }
) {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select("*").range(from, from + PAGE_SIZE - 1);
    if (filter) query = query.eq(filter.column, filter.value);
    const { data, error } = await query;
    if (error) throw new Error(`Failed reading ${table}: ${error.message}`);
    rows.push(...((data || []) as Row[]));
    if ((data || []).length < PAGE_SIZE) return rows;
  }
}

async function readRelatedRows(
  supabase: SupabaseClient,
  table: string,
  foreignKey: string,
  ids: string[]
) {
  if (ids.length === 0) return [];
  const rows: Row[] = [];
  for (let index = 0; index < ids.length; index += WRITE_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .in(foreignKey, ids.slice(index, index + WRITE_CHUNK_SIZE));
    if (error) throw new Error(`Failed reading ${table}: ${error.message}`);
    rows.push(...((data || []) as Row[]));
  }
  return rows;
}

async function writeRows(supabase: SupabaseClient, table: string, rows: Row[], execute: boolean) {
  console.log(`${table}: ${rows.length} row(s)${execute ? "" : " (dry run)"}`);
  if (!execute || rows.length === 0) return;

  for (let index = 0; index < rows.length; index += WRITE_CHUNK_SIZE) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(index, index + WRITE_CHUNK_SIZE), { onConflict: "id" });
    if (error) throw new Error(`Failed writing ${table}: ${error.message}`);
  }
}

function rowJurisdictionSlug(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const slug = (value as Row).jurisdiction_slug;
  return typeof slug === "string" ? slug : null;
}

async function readAuditRows(supabase: SupabaseClient, jurisdictionSlug: string) {
  const rows = await readRows(supabase, "admin_audit_log");
  return rows.filter(
    (row) =>
      rowJurisdictionSlug(row) === jurisdictionSlug ||
      rowJurisdictionSlug(row.before) === jurisdictionSlug ||
      rowJurisdictionSlug(row.after) === jurisdictionSlug
  );
}

async function main() {
  const requested = requireValidJurisdictionSlug(arg("jurisdiction"));
  if (requested === "all") throw new Error("Use one concrete --jurisdiction value.");
  const jurisdiction = getJurisdictionBySlug(requested);
  if (!jurisdiction) throw new Error(`Unknown jurisdiction: ${requested}`);

  const execute = process.argv.includes("--execute");
  const includeControlData = process.argv.includes("--include-control-data");
  const source = client(sourceCredentials(jurisdiction.slug), `${jurisdiction.name} source`);
  const destination = client(
    destinationCredentials(jurisdiction.regionSlug),
    `${jurisdiction.regionSlug} destination`
  );
  const filter = { column: "jurisdiction_slug", value: jurisdiction.slug };

  console.log(
    `${execute ? "Migrating" : "Checking"} ${jurisdiction.name} -> ${jurisdiction.regionSlug}`
  );

  const meetings = await readRows(source, "meetings", filter);
  const meetingIds = meetings.map((row) => String(row.id));
  const documents = await readRows(source, "documents", filter);
  const cards = await readRows(source, "summary_cards", filter);
  const cardIds = cards.map((row) => String(row.id));
  const meetingTranslations = await readRelatedRows(
    source,
    "meeting_translations",
    "meeting_id",
    meetingIds
  );
  const cardTranslations = await readRelatedRows(
    source,
    "summary_card_translations",
    "summary_card_id",
    cardIds
  );

  await writeRows(destination, "meetings", meetings, execute);
  await writeRows(destination, "documents", documents, execute);
  await writeRows(destination, "summary_cards", cards, execute);
  await writeRows(destination, "meeting_translations", meetingTranslations, execute);
  await writeRows(destination, "summary_card_translations", cardTranslations, execute);
  await writeRows(destination, "announcements", await readRows(source, "announcements", filter), execute);
  await writeRows(destination, "scraper_runs", await readRows(source, "scraper_runs", filter), execute);
  await writeRows(
    destination,
    "admin_audit_log",
    await readAuditRows(source, jurisdiction.slug),
    execute
  );

  if (includeControlData) {
    const subscribers = await readRows(source, "email_subscribers");
    await writeRows(destination, "email_subscribers", subscribers, execute);
    await writeRows(destination, "email_subscriptions", await readRows(source, "email_subscriptions"), execute);
    await writeRows(
      destination,
      "email_digest_deliveries",
      await readRows(source, "email_digest_deliveries"),
      execute
    );
  }

  console.log(execute ? "Migration copy completed." : "Dry run completed; no destination rows changed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
