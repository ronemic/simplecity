import "@/lib/env/bootstrap";
import {
  getJurisdictionBySlug,
  getServiceSupabaseClientForJurisdiction,
  requireValidJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { reconcileMeetingRecords } from "@/lib/db/reconcileMeetings";

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const slug = requireValidJurisdictionSlug(getArgValue("jurisdiction") || "san-mateo-county");
  if (slug === "all") throw new Error("Use a concrete jurisdiction with reconcile-meetings.ts.");

  const jurisdiction = getJurisdictionBySlug(slug);
  if (!jurisdiction) throw new Error(`Unknown jurisdiction: ${slug}`);

  const supabase = getServiceSupabaseClientForJurisdiction(slug);
  const dryRun = process.argv.includes("--dry-run");
  const report = await reconcileMeetingRecords(supabase, jurisdiction, { dryRun });

  console.log(JSON.stringify({ jurisdiction: slug, dryRun, ...report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
