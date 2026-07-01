import type { LlmReadyMeeting, PrimeGovMeeting } from "@/lib/types";
import {
  ALL_JURISDICTIONS_SLUG,
  getDefaultJurisdiction,
  getJurisdictionBySlug,
  getJurisdictions,
  getServiceSupabaseClientForJurisdiction,
  type JurisdictionConfig,
  type JurisdictionSelection,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";
import {
  generateSummaryForMeeting,
  hasSummaryProviderConfig,
  isLlmRateLimitError
} from "@/lib/llm/openrouter";
import {
  appendSummaryCardsForMeeting,
  replaceSummaryCardsForMeeting,
  upsertMeetings
} from "@/lib/db/upsertMeetings";
import { extractPdfTextForMeetings } from "@/lib/scraper/pdfText";
import { prepareLlmInput } from "@/lib/scraper/prepareLlmInput";
import { scrapePortal, type ScrapePortalOptions } from "@/lib/scraper/primegov";
import { getJurisdictionDocumentsDir } from "@/lib/scraper/downloadDocuments";
import { scrapeIqm2Meetings } from "@/lib/sources/iqm2";
import { scrapeLegistarMeetings } from "@/lib/sources/legistar";

export type RunSimpleCityPipelineOptions = ScrapePortalOptions & {
  jurisdiction?: JurisdictionSlug | JurisdictionConfig;
  persist?: boolean;
  summarize?: boolean;
  enrichDetails?: boolean;
  clickSeeMore?: boolean;
  limit?: number;
  maxRuntimeMinutes?: number;
};

export type PipelineResult = {
  runId: string | null;
  status: "success" | "success_with_errors" | "failed";
  logs: string[];
  errors: string[];
  meetingsFound: number;
  documentsDownloaded: number;
  cardsGenerated: number;
  meetings: LlmReadyMeeting[];
};

export type MultiJurisdictionPipelineResult = {
  status: PipelineResult["status"];
  logs: string[];
  errors: string[];
  results: Record<JurisdictionSlug, PipelineResult>;
  meetingsFound: number;
  documentsDownloaded: number;
  cardsGenerated: number;
};

function resolvePipelineJurisdiction(
  input?: JurisdictionSlug | JurisdictionConfig
): JurisdictionConfig {
  if (!input) return getDefaultJurisdiction();
  if (typeof input !== "string") return input;

  const jurisdiction = getJurisdictionBySlug(input);
  if (!jurisdiction) throw new Error(`Invalid jurisdiction slug: ${input}`);
  return jurisdiction;
}

function applyJurisdictionMetadata(meetings: PrimeGovMeeting[], jurisdiction: JurisdictionConfig) {
  for (const meeting of meetings) {
    meeting.jurisdictionName = jurisdiction.name;
    meeting.jurisdictionSlug = jurisdiction.slug;
    meeting.platform = jurisdiction.platform;

    for (const doc of meeting.documents) {
      doc.jurisdictionName = jurisdiction.name;
      doc.jurisdictionSlug = jurisdiction.slug;
      doc.platform = jurisdiction.platform;
    }
  }
}

function createDeadline(maxRuntimeMinutes?: number) {
  if (!maxRuntimeMinutes || maxRuntimeMinutes <= 0) return null;

  const deadlineAt = Date.now() + maxRuntimeMinutes * 60_000;
  return {
    exceeded() {
      return Date.now() >= deadlineAt;
    },
    remainingMinutes() {
      return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 60_000));
    }
  };
}

function getMaxConsecutiveRateLimitFailures() {
  const raw = process.env.OPENROUTER_MAX_CONSECUTIVE_RATE_LIMITS;
  if (!raw) return 2;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 2;
}

export async function runSimpleCityPipeline(
  options: RunSimpleCityPipelineOptions = {}
): Promise<PipelineResult> {
  const jurisdiction = resolvePipelineJurisdiction(options.jurisdiction);
  const deadline = createDeadline(options.maxRuntimeMinutes);
  let deadlineRecorded = false;
  const logs: string[] = [];
  const errors: string[] = [];
  const log = (message: string) => {
    const line = `${new Date().toISOString()} [${jurisdiction.slug}] ${message}`;
    logs.push(line);
    options.log?.(message);
  };
  const deadlineExceeded = () => Boolean(deadline?.exceeded() || options.shouldStop?.());
  const recordDeadline = (phase: string) => {
    if (!deadlineExceeded()) return false;

    if (!deadlineRecorded) {
      const message = `Pipeline stopped early during ${phase} to leave time for CI cleanup and persistence.`;
      errors.push(message);
      log(message);
      deadlineRecorded = true;
    }

    return true;
  };

  const persist = options.persist ?? true;
  const shouldSummarize = options.summarize ?? true;
  let supabase = null as ReturnType<typeof getServiceSupabaseClientForJurisdiction> | null;

  if (persist) {
    try {
      supabase = getServiceSupabaseClientForJurisdiction(jurisdiction.slug);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase service environment is not configured.";
      errors.push(message);
      log(message);

      if (jurisdiction.slug !== "foster-city") {
        return {
          runId: null,
          status: "failed",
          logs,
          errors,
          meetingsFound: 0,
          documentsDownloaded: 0,
          cardsGenerated: 0,
          meetings: []
        };
      }
    }
  }

  const canPersist = Boolean(persist && supabase);
  let runId: string | null = null;
  let meetingsFound = 0;
  let documentsDownloaded = 0;
  let cardsGenerated = 0;
  let persistSummaries = canPersist;

  if (persist && !supabase) {
    errors.push("Supabase service environment is not configured; persistence was skipped.");
    log("Supabase service environment is not configured; persistence will be skipped.");
  }

  if (canPersist && supabase) {
    const { data, error } = await supabase
      .from("scraper_runs")
      .insert({
        jurisdiction_slug: jurisdiction.slug,
        platform: jurisdiction.platform,
        status: "running",
        logs: []
      })
      .select("id")
      .single();

    if (error) {
      const message = `Failed to create scraper run record: ${error.message}`;
      errors.push(message);
      log(message);
    } else {
      runId = data?.id || null;
    }
  }

  try {
    log(`Starting SimpleCity pipeline for ${jurisdiction.name}.`);
    if (deadline) {
      log(`Pipeline soft deadline is ${deadline.remainingMinutes()} minute(s) from start.`);
    }

    const documentOutputDir =
      options.documentOutputDir || getJurisdictionDocumentsDir(jurisdiction.slug);
    const scrapeResult =
      jurisdiction.platform === "iqm2"
        ? await scrapeIqm2Meetings({
            ...options,
            jurisdiction,
            portalUrl: options.portalUrl || jurisdiction.iqm2Url || jurisdiction.sourceUrl,
            documentOutputDir,
            downloadDocuments: options.downloadDocuments ?? true,
            shouldStop: deadlineExceeded,
            log
          })
        : jurisdiction.platform === "legistar"
          ? await scrapeLegistarMeetings({
              ...options,
              jurisdiction,
              portalUrl: options.portalUrl || jurisdiction.legistarUrl || jurisdiction.sourceUrl,
              documentOutputDir,
              downloadDocuments: options.downloadDocuments ?? true,
              shouldStop: deadlineExceeded,
              log
            })
        : await scrapePortal({
            ...options,
            portalUrl: options.portalUrl || jurisdiction.primegovUrl || jurisdiction.sourceUrl,
            documentOutputDir,
            scrapeHtmlAgendas: options.scrapeHtmlAgendas ?? true,
            downloadDocuments: options.downloadDocuments ?? true,
            shouldStop: deadlineExceeded,
            log
          });
    applyJurisdictionMetadata(scrapeResult.meetings, jurisdiction);

    meetingsFound = scrapeResult.totalMeetingCount;
    documentsDownloaded = scrapeResult.meetings
      .flatMap((meeting) => meeting.documents)
      .filter((doc) => Boolean(doc.localPath)).length;

    if (!recordDeadline("PDF text extraction")) {
      log("Extracting PDF text.");
      const pdfNotes = await extractPdfTextForMeetings(scrapeResult.meetings);
      for (const note of pdfNotes) log(note);
    }

    log("Preparing LLM input.");
    const llmReadyMeetings = await prepareLlmInput(scrapeResult.meetings);

    let upserted: Awaited<ReturnType<typeof upsertMeetings>> = [];
    if (canPersist && supabase) {
      log(`Upserting meetings and documents to Supabase for ${jurisdiction.name}.`);
      try {
        upserted = await upsertMeetings(
          supabase,
          llmReadyMeetings,
          scrapeResult.scrapedAt,
          jurisdiction
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown persistence error";
        errors.push(message);
        log(`Persistence failed; continuing without database writes: ${message}`);
        upserted = [];
        persistSummaries = false;
      }
    } else {
      log("Skipping Supabase persistence.");
    }

    if (shouldSummarize && !recordDeadline("LLM summarization")) {
      if (!hasSummaryProviderConfig()) {
        errors.push("No LLM provider API key is configured; summaries were not generated.");
        log("Configure OPENROUTER_API_KEY or CEREBRAS_API_KEY to generate LLM summaries.");
      } else if (persist && !persistSummaries) {
        const message =
          "Skipping LLM summaries because database persistence failed; generated cards would not appear on the frontend.";
        errors.push(message);
        log(message);
      } else {
        const summaryTargets = persistSummaries
          ? upserted
          : llmReadyMeetings.map((meeting) => ({
              externalId: meeting.id,
              id: "",
              meeting,
              sourceHash: null,
              summarizedSourceHash: null,
              existingCardCount: 0
            }));
        let consecutiveRateLimitFailures = 0;
        const maxConsecutiveRateLimitFailures = getMaxConsecutiveRateLimitFailures();

        for (const item of summaryTargets) {
          if (recordDeadline("LLM summarization")) break;

          if (!item.meeting.llmInputText) {
            log(`Skipping ${item.meeting.title}; no LLM input text.`);
            continue;
          }

          try {
            const shouldAppendToExisting =
              Boolean(persistSummaries && supabase && item.id && item.existingCardCount > 0);

            if (shouldAppendToExisting && item.summarizedSourceHash === item.sourceHash) {
              log(`Skipping ${item.meeting.title}; source unchanged and cards already exist.`);
              continue;
            }

            const { summary, raw } = await generateSummaryForMeeting(item.meeting, { log });
            if (persistSummaries && supabase && item.id) {
              const inserted = shouldAppendToExisting
                ? await appendSummaryCardsForMeeting(
                    supabase,
                    item.id,
                    summary,
                    raw,
                    {
                      jurisdiction,
                      sourceHash: item.sourceHash
                    }
                  )
                : await replaceSummaryCardsForMeeting(
                    supabase,
                    item.id,
                    summary,
                    raw,
                    {
                      allowEmptyReplacement: true,
                      jurisdiction,
                      sourceHash: item.sourceHash
                    }
                  );
              if (shouldAppendToExisting) {
                log(`Kept ${item.existingCardCount} existing cards for ${item.meeting.title}; appended ${inserted.length} new cards.`);
              }
              cardsGenerated += inserted.length;
            } else {
              cardsGenerated += summary.cards.length;
            }
            consecutiveRateLimitFailures = 0;
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown LLM error";
            errors.push(`${item.meeting.title}: ${message}`);
            log(`LLM failed for ${item.meeting.title}: ${message}`);

            if (isLlmRateLimitError(error)) {
              consecutiveRateLimitFailures += 1;
              if (consecutiveRateLimitFailures >= maxConsecutiveRateLimitFailures) {
                const stopMessage =
                  "Stopping LLM summaries after repeated provider rate-limit responses; retry later or configure another provider with available quota.";
                errors.push(stopMessage);
                log(stopMessage);
                break;
              }
            } else {
              consecutiveRateLimitFailures = 0;
            }
          }
        }
      }
    }

    const status = errors.length > 0 ? "success_with_errors" : "success";
    log(`Pipeline finished with status ${status}.`);

    if (canPersist && supabase && runId) {
      try {
        await supabase
          .from("scraper_runs")
          .update({
            finished_at: new Date().toISOString(),
            status,
            jurisdiction_slug: jurisdiction.slug,
            platform: jurisdiction.platform,
            meetings_found: meetingsFound,
            documents_downloaded: documentsDownloaded,
            cards_generated: cardsGenerated,
            error: errors.join("\n") || null,
            logs
          })
          .eq("id", runId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown scraper_runs update error";
        errors.push(message);
        log(`Failed to update scraper run record: ${message}`);
      }
    }

    return {
      runId,
      status,
      logs,
      errors,
      meetingsFound,
      documentsDownloaded,
      cardsGenerated,
      meetings: llmReadyMeetings
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    errors.push(message);
    log(`Pipeline failed: ${message}`);

    if (canPersist && supabase && runId) {
      try {
        await supabase
          .from("scraper_runs")
          .update({
            finished_at: new Date().toISOString(),
            status: "failed",
            jurisdiction_slug: jurisdiction.slug,
            platform: jurisdiction.platform,
            meetings_found: meetingsFound,
            documents_downloaded: documentsDownloaded,
            cards_generated: cardsGenerated,
            error: message,
            logs
          })
          .eq("id", runId);
      } catch {
        // If scraper run persistence is unavailable, fall through and return the in-memory result.
      }
    }

    return {
      runId,
      status: "failed",
      logs,
      errors,
      meetingsFound,
      documentsDownloaded,
      cardsGenerated,
      meetings: []
    };
  }
}

export async function runJurisdictionPipelines(
  selection: JurisdictionSelection = ALL_JURISDICTIONS_SLUG,
  options: Omit<RunSimpleCityPipelineOptions, "jurisdiction"> = {}
): Promise<MultiJurisdictionPipelineResult> {
  const jurisdictions =
    selection === ALL_JURISDICTIONS_SLUG
      ? getJurisdictions()
      : [resolvePipelineJurisdiction(selection)];
  const results = {} as Record<JurisdictionSlug, PipelineResult>;
  const logs: string[] = [];
  const errors: string[] = [];

  for (const jurisdiction of jurisdictions) {
    try {
      const result = await runSimpleCityPipeline({
        ...options,
        jurisdiction
      });
      results[jurisdiction.slug] = result;
      logs.push(...result.logs);
      errors.push(...result.errors.map((error) => `${jurisdiction.name}: ${error}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown jurisdiction pipeline error";
      errors.push(`${jurisdiction.name}: ${message}`);
      const failed: PipelineResult = {
        runId: null,
        status: "failed",
        logs: [`${new Date().toISOString()} [${jurisdiction.slug}] ${message}`],
        errors: [message],
        meetingsFound: 0,
        documentsDownloaded: 0,
        cardsGenerated: 0,
        meetings: []
      };
      results[jurisdiction.slug] = failed;
      logs.push(...failed.logs);
    }
  }

  const resultList = Object.values(results);
  const status = resultList.some((result) => result.status === "failed")
    ? resultList.some((result) => result.status !== "failed")
      ? "success_with_errors"
      : "failed"
    : errors.length > 0 || resultList.some((result) => result.status === "success_with_errors")
      ? "success_with_errors"
      : "success";

  return {
    status,
    logs,
    errors,
    results,
    meetingsFound: resultList.reduce((sum, result) => sum + result.meetingsFound, 0),
    documentsDownloaded: resultList.reduce((sum, result) => sum + result.documentsDownloaded, 0),
    cardsGenerated: resultList.reduce((sum, result) => sum + result.cardsGenerated, 0)
  };
}
