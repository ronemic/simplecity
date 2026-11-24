import "@/lib/env/bootstrap";
import {
  getJurisdictionBySlug,
  getJurisdictions,
  getServiceSupabaseClientForJurisdiction
} from "@/lib/config/jurisdictions";
import { attachMisfiledMinutesToRecordedMeetings } from "@/lib/db/misfiledMinutes";
import { reconcileDecisionOutcomesForMeeting } from "@/lib/db/upsertDecisionOutcomes";

/**
 * Attach minutes stored on a later meeting to the meeting they record, then
 * reconcile that meeting's decision outcomes. Dry run unless --execute.
 *
 *   node --import tsx/esm scripts/attach-misfiled-minutes.ts --jurisdiction=carpinteria [--execute]
 */
const execute = process.argv.includes("--execute");
const requested = process.argv.find((value) => value.startsWith("--jurisdiction="))?.split("=")[1];
const jurisdictions = requested && requested !== "all"
  ? [getJurisdictionBySlug(requested)].filter((value) => value !== undefined && value !== null)
  : getJurisdictions();
if (jurisdictions.length === 0) throw new Error(`Unknown --jurisdiction: ${requested}`);

for (const jurisdiction of jurisdictions) {
  const supabase = getServiceSupabaseClientForJurisdiction(jurisdiction.slug);
  const gained = await attachMisfiledMinutesToRecordedMeetings(supabase, jurisdiction, console.log, { execute });
  let upserted = 0;
  if (execute) {
    for (const meeting of gained) {
      const result = await reconcileDecisionOutcomesForMeeting(supabase, meeting.id as string, meeting, jurisdiction, {
        explainWithLlm: true,
        translateWithLlm: false,
        log: console.log
      });
      upserted += result.outcomesUpserted;
    }
  }
  console.log(
    `${jurisdiction.name}: ${gained.length} meeting(s) ${execute ? `gained minutes; ${upserted} outcome(s) upserted` : "would gain minutes (dry run)"}.`
  );
}
