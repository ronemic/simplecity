/**
 * Recomputes `meetings.meeting_datetime` from the stored `date_text` / `time_text`
 * using the current parser, and reports or repairs rows that disagree.
 *
 * Why this exists: the time parser used to drop the meridiem when the source
 * included seconds ("8/13/2026 1:00:00 PM"), so Redwood City's evening meetings
 * were stored 12 hours early — a 6pm council meeting was published as 6am. The
 * parser is fixed, but rows written before the fix keep the wrong instant until
 * they are recomputed or re-scraped.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node --import tsx/esm scripts/backfill-meeting-datetimes.ts
 *   node --import tsx/esm scripts/backfill-meeting-datetimes.ts --jurisdiction=redwood-city
 *   node --import tsx/esm scripts/backfill-meeting-datetimes.ts --apply
 */
import "@/lib/env/bootstrap";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getJurisdictions,
  getServiceSupabaseClientForJurisdiction
} from "@/lib/config/jurisdictions";
import { CIVIC_TIME_ZONE, hasExplicitClockTime, parseMeetingDate } from "@/lib/utils/date";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.find((a) => a.startsWith("--jurisdiction="))?.split("=")[1];

function pacific(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CIVIC_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

type Row = {
  id: string;
  jurisdiction_slug: string;
  title: string | null;
  date_text: string | null;
  time_text: string | null;
  meeting_datetime: string | null;
};

function combinedText(row: Row) {
  const dateText = row.date_text || "";
  const timeText = row.time_text || "";
  if (!dateText) return null;
  if (!timeText || dateText.toLowerCase().includes(timeText.toLowerCase())) return dateText;
  return `${dateText} ${timeText}`.trim();
}

const seenClients = new Map<string, SupabaseClient>();
let scanned = 0;
let mismatched = 0;
let written = 0;
let preserved = 0;
const skipped: string[] = [];

for (const jurisdiction of getJurisdictions()) {
  if (only && jurisdiction.slug !== only) continue;

  let supabase: SupabaseClient;
  try {
    supabase = getServiceSupabaseClientForJurisdiction(jurisdiction.slug);
    seenClients.set(jurisdiction.slug, supabase);
  } catch (error) {
    skipped.push(`${jurisdiction.slug} (${error instanceof Error ? error.message.slice(0, 48) : "no service key"})`);
    continue;
  }

  const { data, error } = await supabase
    .from("meetings")
    .select("id,jurisdiction_slug,title,date_text,time_text,meeting_datetime")
    .eq("jurisdiction_slug", jurisdiction.slug)
    .not("date_text", "is", null)
    .limit(10000);

  if (error) {
    console.error(`  ${jurisdiction.slug}: ${error.message}`);
    continue;
  }

  for (const row of (data || []) as Row[]) {
    scanned += 1;
    const text = combinedText(row);
    if (!text) continue;

    // Only rows whose own text states a clock time are candidates.
    //
    // Several portals (Legistar, PrimeGov) store a bare date in `date_text` while
    // the real time arrived through another field at scrape time. Recomputing
    // those from text alone would replace a correct 9:00 AM board meeting with
    // midnight, so they are left strictly alone — this script exists to undo a
    // meridiem error, not to re-derive times it cannot see.
    if (!hasExplicitClockTime(text)) {
      preserved += 1;
      continue;
    }

    const recomputed = parseMeetingDate(text);
    if (!recomputed) continue;
    if (row.meeting_datetime && new Date(row.meeting_datetime).getTime() === new Date(recomputed).getTime()) {
      continue;
    }

    mismatched += 1;
    console.log(
      `  ${row.jurisdiction_slug.padEnd(26)} ${JSON.stringify(text).padEnd(28)}\n` +
        `    stored     ${row.meeting_datetime ? pacific(row.meeting_datetime) : "(null)"}\n` +
        `    recomputed ${pacific(recomputed)}   ${String(row.title || "").slice(0, 46)}`
    );

    if (!apply) continue;

    const { error: updateError } = await supabase
      .from("meetings")
      .update({ meeting_datetime: recomputed })
      .eq("id", row.id);

    if (updateError) console.error(`    WRITE FAILED: ${updateError.message}`);
    else written += 1;
  }
}

console.log(`\nscanned ${scanned} meetings`);
console.log(`disagree with the current parser: ${mismatched}`);
console.log(`left alone because their text has no clock time: ${preserved}`);
console.log(apply ? `rows updated: ${written}` : "dry run — nothing written (pass --apply to write)");
if (skipped.length) console.log(`skipped: ${skipped.join(", ")}`);
