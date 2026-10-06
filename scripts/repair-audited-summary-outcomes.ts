import "@/lib/env/bootstrap";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { getServiceSupabaseClientForJurisdiction } from "@/lib/config/jurisdictions";
import { DECISION_OUTCOME_PARSER_VERSION } from "@/lib/outcomes/extractDecisionOutcome";

// Deliberately fixed to the two individually reviewed records. This is not a
// historical backfill: a parser returning null is not permission to delete.
const targets = new Set([
  "d57a4001-17f4-4a63-8c03-2837d2f88b0c",
  "116cdd25-f248-4091-9b81-1471558b83aa"
]);
const plan = JSON.parse(await readFile(new URL(
  "../docs/audits/2026-10-06-summary-outcome-reconciliation.json", import.meta.url
), "utf8")) as {
  parserVersion: string;
  changes: Array<{
    cardId: string;
    before: Record<string, unknown> & { id: string; source_hash: string; summary_card_id: string };
    after: Record<string, unknown> | null;
    verification: string;
  }>;
};
if (plan.parserVersion !== DECISION_OUTCOME_PARSER_VERSION || plan.changes.length !== targets.size ||
    new Set(plan.changes.map((change) => change.cardId)).size !== targets.size) {
  throw new Error("The reviewed plan does not match the current parser or target set.");
}
function matchesAfter(current: Record<string, unknown>, after: Record<string, unknown>) {
  return Object.entries(after).every(([key, value]) => {
    if (key === "decided_at" && typeof value === "string" && typeof current[key] === "string") {
      return Date.parse(current[key]) === Date.parse(value);
    }
    if (key === "match_score" && typeof value === "number" && typeof current[key] === "number") {
      return Math.abs(current[key] - value) < 1e-12;
    }
    return isDeepStrictEqual(current[key], value);
  });
}

const db = getServiceSupabaseClientForJurisdiction("foster-city");
const execute = process.argv.includes("--execute");
for (const change of plan.changes) {
  if (!targets.has(change.cardId) || change.before.summary_card_id !== change.cardId || !change.verification) {
    throw new Error("Unreviewed target in repair plan.");
  }
  const { data: current, error } = await db.from("decision_outcomes").select("*").eq("id", change.before.id).maybeSingle();
  if (error) throw new Error(error.message);
  if ((!current && !change.after) || (current && change.after &&
      matchesAfter(current, change.after))) {
    console.log(`${change.cardId}: already repaired`);
    continue;
  }
  if (!isDeepStrictEqual(current, change.before)) {
    throw new Error(`${change.cardId}: stored record changed since review; refusing to overwrite.`);
  }
  console.log(`${change.cardId}: ${change.after ? "replace neighboring-motion evidence" : "remove unrelated housing outcome"}`);
  if (!execute) continue;
  const mutation = change.after
    ? db.from("decision_outcomes").update(change.after)
    : db.from("decision_outcomes").delete();
  let query = mutation.eq("id", change.before.id)
    .eq("summary_card_id", change.cardId).eq("source_hash", change.before.source_hash);
  if (change.before.updated_at) query = query.eq("updated_at", String(change.before.updated_at));
  const { data, error: writeError } = await query.select("id");
  if (writeError || data?.length !== 1) throw new Error(writeError?.message || "Concurrent change prevented repair.");
  const verified = await db.from("decision_outcomes").select("*").eq("id", change.before.id).maybeSingle();
  if (verified.error || (change.after
    ? !verified.data || !matchesAfter(verified.data, change.after)
    : verified.data !== null)) throw new Error("Repair read-back failed.");
  console.log(`${change.cardId}: verified`);
}
console.log(execute ? "Reviewed repairs applied." : "Dry run only. Pass --execute to apply the reviewed plan.");
