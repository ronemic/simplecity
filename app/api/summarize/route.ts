import { assertAdminForRoute } from "@/lib/supabase/admin";
import { replaceSummaryCardsForMeeting } from "@/lib/db/upsertMeetings";
import { revalidatePublicContent } from "@/lib/db/revalidatePublicContent";
import { generateSummaryForMeeting } from "@/lib/llm/openrouter";
import type { MeetingRow } from "@/lib/types";
import { meetingRowToLlmReadyMeeting } from "@/lib/db/meetingTransform";
import { meetingSourceHash } from "@/lib/db/meetingSourceHash";
import {
  getDefaultJurisdiction,
  getJurisdictionBySlug,
  getJurisdictionSlugFromRow,
  getServiceSupabaseClientForJurisdiction,
  requireValidJurisdictionSlug
} from "@/lib/config/jurisdictions";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const { response } = await assertAdminForRoute();
  if (response) return response;

  const body = (await request.json()) as { meetingId?: string; jurisdiction?: string };
  if (!body.meetingId) {
    return Response.json({ error: "meetingId is required." }, { status: 400 });
  }

  let jurisdictionSlug;
  try {
    const requested = body.jurisdiction || getDefaultJurisdiction().slug;
    const valid = requireValidJurisdictionSlug(requested);
    if (valid === "all") {
      return Response.json({ error: "A concrete jurisdiction is required." }, { status: 400 });
    }
    jurisdictionSlug = valid;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid jurisdiction." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClientForJurisdiction(jurisdictionSlug);
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", body.meetingId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!meeting) return Response.json({ error: "Meeting not found." }, { status: 404 });

  const row = meeting as MeetingRow;
  const resolvedJurisdiction =
    getJurisdictionBySlug(getJurisdictionSlugFromRow(row.jurisdiction_slug || jurisdictionSlug)) ||
    getDefaultJurisdiction();
  const llmMeeting = meetingRowToLlmReadyMeeting(row);

  const result = await generateSummaryForMeeting(llmMeeting);
  const sourceHash = row.source_hash || meetingSourceHash(llmMeeting);
  const cards = await replaceSummaryCardsForMeeting(supabase, row.id, result.summary, result.raw, {
    allowEmptyReplacement: true,
    jurisdiction: resolvedJurisdiction,
    sourceHash
  });
  revalidatePublicContent([`/meetings/${row.id}?jurisdiction=${resolvedJurisdiction.slug}`]);

  return Response.json({ cardsGenerated: cards.length, summary: result.summary });
}
