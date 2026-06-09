import { assertAdminForRoute } from "@/lib/supabase/admin";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { replaceSummaryCardsForMeeting } from "@/lib/db/upsertMeetings";
import { generateSummaryForMeeting } from "@/lib/llm/openrouter";
import type { MeetingRow } from "@/lib/types";
import { meetingRowToLlmReadyMeeting } from "@/lib/db/meetingTransform";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const { response } = await assertAdminForRoute();
  if (response) return response;

  const body = (await request.json()) as { meetingId?: string };
  if (!body.meetingId) {
    return Response.json({ error: "meetingId is required." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", body.meetingId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!meeting) return Response.json({ error: "Meeting not found." }, { status: 404 });

  const row = meeting as MeetingRow;
  const llmMeeting = meetingRowToLlmReadyMeeting(row);

  const result = await generateSummaryForMeeting(llmMeeting);
  const cards = await replaceSummaryCardsForMeeting(supabase, row.id, result.summary, result.raw);

  return Response.json({ cardsGenerated: cards.length, summary: result.summary });
}
