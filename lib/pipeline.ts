import { createServiceSupabaseClient, maybeCreateServiceSupabaseClient } from "@/lib/supabase/service";
import type { LlmReadyMeeting } from "@/lib/types";
import { generateSummaryForMeeting } from "@/lib/llm/openrouter";
import { replaceSummaryCardsForMeeting, upsertMeetings } from "@/lib/db/upsertMeetings";
import { extractPdfTextForMeetings } from "@/lib/scraper/pdfText";
import { prepareLlmInput } from "@/lib/scraper/prepareLlmInput";
import { scrapePortal, type ScrapePortalOptions } from "@/lib/scraper/primegov";

export type RunSimpleCityPipelineOptions = ScrapePortalOptions & {
  persist?: boolean;
  summarize?: boolean;
};

export type PipelineResult = {
  runId: string | null;
  status: "success" | "success_with_errors" | "failed";
  logs: string[];
  meetingsFound: number;
  documentsDownloaded: number;
  cardsGenerated: number;
  meetings: LlmReadyMeeting[];
};

export async function runSimpleCityPipeline(
  options: RunSimpleCityPipelineOptions = {}
): Promise<PipelineResult> {
  const logs: string[] = [];
  const log = (message: string) => {
    const line = `${new Date().toISOString()} ${message}`;
    logs.push(line);
    options.log?.(message);
  };

  const persist = options.persist ?? true;
  const shouldSummarize = options.summarize ?? true;
  const supabase = persist ? maybeCreateServiceSupabaseClient() : null;
  const canPersist = Boolean(persist && supabase);
  let runId: string | null = null;
  let meetingsFound = 0;
  let documentsDownloaded = 0;
  let cardsGenerated = 0;
  const errors: string[] = [];

  if (persist && !supabase) {
    errors.push("Supabase service environment is not configured; persistence was skipped.");
    log("Supabase service environment is not configured; persistence will be skipped.");
  }

  if (canPersist && supabase) {
    const { data, error } = await supabase
      .from("scraper_runs")
      .insert({ status: "running", logs: [] })
      .select("id")
      .single();

    if (!error) runId = data?.id || null;
  }

  try {
    log("Starting SimpleCity pipeline.");

    const scrapeResult = await scrapePortal({
      ...options,
      scrapeHtmlAgendas: options.scrapeHtmlAgendas ?? true,
      downloadDocuments: options.downloadDocuments ?? true,
      log
    });

    meetingsFound = scrapeResult.totalMeetingCount;
    documentsDownloaded = scrapeResult.meetings
      .flatMap((meeting) => meeting.documents)
      .filter((doc) => Boolean(doc.localPath)).length;

    log("Extracting PDF text.");
    const pdfNotes = await extractPdfTextForMeetings(scrapeResult.meetings);
    for (const note of pdfNotes) log(note);

    log("Preparing LLM input.");
    const llmReadyMeetings = await prepareLlmInput(scrapeResult.meetings);

    let upserted: Awaited<ReturnType<typeof upsertMeetings>> = [];
    if (canPersist && supabase) {
      const serviceClient = supabase || createServiceSupabaseClient();
      log("Upserting meetings and documents to Supabase.");
      upserted = await upsertMeetings(serviceClient, llmReadyMeetings, scrapeResult.scrapedAt);
    } else {
      log("Skipping Supabase persistence.");
    }

    if (shouldSummarize) {
      if (!process.env.OPENROUTER_API_KEY) {
        errors.push("OPENROUTER_API_KEY is not configured; summaries were not generated.");
        log("OPENROUTER_API_KEY is not configured; skipping LLM summaries.");
      } else {
        const summaryTargets =
          canPersist && upserted.length > 0
            ? upserted
            : llmReadyMeetings.map((meeting) => ({
                externalId: meeting.id,
                id: "",
                meeting
              }));

        for (const item of summaryTargets) {
          if (!item.meeting.llmInputText) {
            log(`Skipping ${item.meeting.title}; no LLM input text.`);
            continue;
          }

          try {
            const { summary, raw } = await generateSummaryForMeeting(item.meeting, { log });
            if (canPersist && supabase) {
              const serviceClient = supabase || createServiceSupabaseClient();
              const inserted = await replaceSummaryCardsForMeeting(serviceClient, item.id, summary, raw);
              cardsGenerated += inserted.length;
            } else {
              cardsGenerated += summary.cards.length;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown LLM error";
            errors.push(`${item.meeting.title}: ${message}`);
            log(`LLM failed for ${item.meeting.title}: ${message}`);
          }
        }
      }
    }

    const status = errors.length > 0 ? "success_with_errors" : "success";
    log(`Pipeline finished with status ${status}.`);

    if (canPersist && supabase && runId) {
      await supabase
        .from("scraper_runs")
        .update({
          finished_at: new Date().toISOString(),
          status,
          meetings_found: meetingsFound,
          documents_downloaded: documentsDownloaded,
          cards_generated: cardsGenerated,
          error: errors.join("\n") || null,
          logs
        })
        .eq("id", runId);
    }

    return {
      runId,
      status,
      logs,
      meetingsFound,
      documentsDownloaded,
      cardsGenerated,
      meetings: llmReadyMeetings
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    log(`Pipeline failed: ${message}`);

    if (canPersist && supabase && runId) {
      await supabase
        .from("scraper_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "failed",
          meetings_found: meetingsFound,
          documents_downloaded: documentsDownloaded,
          cards_generated: cardsGenerated,
          error: message,
          logs
        })
        .eq("id", runId);
    }

    return {
      runId,
      status: "failed",
      logs,
      meetingsFound,
      documentsDownloaded,
      cardsGenerated,
      meetings: []
    };
  }
}
