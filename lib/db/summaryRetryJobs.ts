import type { SupabaseClient } from "@supabase/supabase-js";

export type SummaryRetryJob = {
  meetingId: string;
  sourceHash: string;
  attemptCount: number;
  nextAttemptAt: string;
};

export function summaryRetryDelayMs(attemptCount: number) {
  const baseMs = Number(process.env.SUMMARY_RETRY_BASE_MS || 5 * 60_000);
  const maxMs = Number(process.env.SUMMARY_RETRY_MAX_MS || 6 * 60 * 60_000);
  const safeBase = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : 5 * 60_000;
  const safeMax = Number.isFinite(maxMs) && maxMs > 0 ? maxMs : 6 * 60 * 60_000;
  return Math.min(safeMax, safeBase * 2 ** Math.max(0, attemptCount - 1));
}

export function isSummaryRetryDue(job: SummaryRetryJob | undefined, now = Date.now()) {
  return !job || Date.parse(job.nextAttemptAt) <= now;
}

export async function loadSummaryRetryJobs(
  supabase: SupabaseClient,
  jurisdictionSlug: string,
  meetingIds: string[]
) {
  const jobs = new Map<string, SummaryRetryJob>();
  if (meetingIds.length === 0) return jobs;

  for (let index = 0; index < meetingIds.length; index += 100) {
    const { data, error } = await supabase
      .from("summary_retry_jobs")
      .select("meeting_id,source_hash,attempt_count,next_attempt_at")
      .eq("jurisdiction_slug", jurisdictionSlug)
      .in("meeting_id", meetingIds.slice(index, index + 100));
    if (error) throw new Error(`Failed to load summary retry jobs: ${error.message}`);
    for (const row of data || []) {
      jobs.set(`${row.meeting_id}:${row.source_hash}`, {
        meetingId: row.meeting_id,
        sourceHash: row.source_hash,
        attemptCount: row.attempt_count,
        nextAttemptAt: row.next_attempt_at
      });
    }
  }
  return jobs;
}

export async function deferSummaryRetryJob(
  supabase: SupabaseClient,
  jurisdictionSlug: string,
  meetingId: string,
  sourceHash: string,
  errorMessage: string,
  previous?: SummaryRetryJob
) {
  const attemptCount = (previous?.attemptCount || 0) + 1;
  const nextAttemptAt = new Date(Date.now() + summaryRetryDelayMs(attemptCount)).toISOString();
  const { error } = await supabase.from("summary_retry_jobs").upsert(
    {
      jurisdiction_slug: jurisdictionSlug,
      meeting_id: meetingId,
      source_hash: sourceHash,
      attempt_count: attemptCount,
      next_attempt_at: nextAttemptAt,
      last_error: errorMessage.slice(0, 2000)
    },
    { onConflict: "jurisdiction_slug,meeting_id,source_hash" }
  );
  if (error) throw new Error(`Failed to defer summary retry job: ${error.message}`);
  return { meetingId, sourceHash, attemptCount, nextAttemptAt } satisfies SummaryRetryJob;
}

export async function clearSummaryRetryJobs(
  supabase: SupabaseClient,
  jurisdictionSlug: string,
  meetingId: string
) {
  const { error } = await supabase
    .from("summary_retry_jobs")
    .delete()
    .eq("jurisdiction_slug", jurisdictionSlug)
    .eq("meeting_id", meetingId);
  if (error) throw new Error(`Failed to clear summary retry jobs: ${error.message}`);
}
