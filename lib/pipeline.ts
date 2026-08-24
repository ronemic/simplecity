import type { LlmReadyMeeting, PrimeGovMeeting, SimpleCitySummary } from "@/lib/types";
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
} from "@/lib/llm/groq";
import {
  agendaItemsRequiringCards,
  completeAgendaItemCoverage
} from "@/lib/llm/agendaItemCoverage";
import {
  appendSummaryCardsForMeeting,
  replaceSummaryCardsForMeeting,
  restoreArchivedDocumentExtractions,
  setMeetingSummarizedSourceHash,
  upsertMeetings
} from "@/lib/db/upsertMeetings";
import { meetingSourceHashComponents } from "@/lib/db/meetingSourceHash";
import { reconcileMeetingRecords } from "@/lib/db/reconcileMeetings";
import { reconcileDecisionOutcomesForMeeting } from "@/lib/db/upsertDecisionOutcomes";
import { extractPdfTextForMeetings } from "@/lib/scraper/pdfText";
import {
  authoritativeAgendaItemSourceIds,
  isCancellationNoticeText,
  isMeetingCancelled,
  prepareLlmInput
} from "@/lib/scraper/prepareLlmInput";
import {
  isUsablePrimeGovHtmlAgendaText,
  scrapePortal,
  type ScrapePortalOptions
} from "@/lib/scraper/primegov";
import { getJurisdictionDocumentsDir } from "@/lib/scraper/downloadDocuments";
import {
  hasUsableOfficialDocumentText,
  isUsableOfficialSourceText
} from "@/lib/scraper/documentUsability";
import { scrapeIqm2Meetings } from "@/lib/sources/iqm2";
import { scrapeLegistarMeetings } from "@/lib/sources/legistar";
import {
  enrichSantaBarbaraPlanningCommissionItems,
  scrapeSantaBarbaraCountyMeetings
} from "@/lib/sources/santa-barbara-county";
import { scrapeCivicClerkMeetings } from "@/lib/sources/civicclerk";
import { scrapeAgendaOnlineMeetings } from "@/lib/sources/agenda-online";
import { scrapeSimbliMeetings } from "@/lib/sources/simbli";
import {
  enrichMenloParkMeetingTimesFromAgendaText,
  scrapeMenloParkMeetings
} from "@/lib/sources/menlo-park";
import { scrapeEastPaloAltoMeetings } from "@/lib/sources/east-palo-alto";
import { scrapeEscribeMeetings } from "@/lib/sources/escribe";
import { redactPublicLogMessage } from "@/lib/logging/publicLog";
import {
  formatLlmProcessRunSummary,
  getLlmProcessBudgetUsage,
  isLlmProcessBudgetExceededError,
  isLlmProcessBudgetExhausted,
  runWithLlmProcessBudget
} from "@/lib/llm/provider";

export type RunSimpleCityPipelineOptions = ScrapePortalOptions & {
  jurisdiction?: JurisdictionSlug | JurisdictionConfig;
  persist?: boolean;
  summarize?: boolean;
  enrichDetails?: boolean;
  clickSeeMore?: boolean;
  limit?: number;
  monthsBack?: number;
  monthsForward?: number;
  allVisible?: boolean;
  body?: string;
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
  generatedSummaries: Array<{
    meetingId: string;
    meetingTitle: string;
    dateText: string | null;
    summary: SimpleCitySummary;
  }>;
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

export function minutesIngestionErrors(meetings: PrimeGovMeeting[]) {
  const errors: string[] = [];

  for (const meeting of meetings) {
    const minutesByUrl = new Map<string, PrimeGovMeeting["documents"]>();
    for (const document of meeting.documents) {
      if (!["Minutes", "Accessible Minutes"].includes(document.type)) continue;
      if (/empty unpublished placeholder/i.test(String(document.downloadError || ""))) {
        continue;
      }
      minutesByUrl.set(document.url, [
        ...(minutesByUrl.get(document.url) || []),
        document
      ]);
    }
    const minutes = Array.from(minutesByUrl.values());
    const failed = minutes.filter((documents) =>
      documents.every((document) => Boolean(document.downloadError))
    );
    const unreadable = minutes.filter(
      (documents) =>
        documents.some((document) => !document.downloadError) &&
        !documents.some((document) => hasUsableOfficialDocumentText(document)) &&
        !documents.some(isDownloadedScannedPdf)
    );

    const hasUsableMinutes = minutes.some((documents) =>
      documents.some((document) => hasUsableOfficialDocumentText(document))
    );
    if (hasUsableMinutes) continue;

    if (failed.length > 0) {
      errors.push(
        `Minutes ingestion incomplete for ${meeting.title}: ${failed.length} published minutes document(s) failed to download.`
      );
    }
    if (unreadable.length > 0) {
      errors.push(
        `Minutes ingestion incomplete for ${meeting.title}: ${unreadable.length} published minutes document(s) had no usable extracted text.`
      );
    }
  }

  return errors;
}

export function minutesIngestionWarnings(meetings: PrimeGovMeeting[]) {
  const warnings: string[] = [];

  for (const meeting of meetings) {
    const scannedUrls = new Set(
      meeting.documents
        .filter((document) =>
          ["Minutes", "Accessible Minutes"].includes(document.type) &&
          isDownloadedScannedPdf(document)
        )
        .map((document) => document.url)
    );
    if (scannedUrls.size > 0) {
      warnings.push(
        `Minutes OCR warning for ${meeting.title}: ${scannedUrls.size} downloaded minutes document(s) are image-only; official links remain available.`
      );
    }
  }

  return warnings;
}

const AGENDA_DOCUMENT_TYPES = new Set([
  "HTML Agenda",
  "Agenda",
  "Accessible Agenda",
  "Agenda Packet",
  "Packet"
]);

function agendaDocumentMinimumCharacters(type: string) {
  return type === "Accessible Agenda" ? 500 : 300;
}

function isDownloadedScannedPdf(document: PrimeGovMeeting["documents"][number]) {
  return Boolean(
    !document.downloadError &&
      document.isScanned &&
      document.localPath &&
      /\.pdf$/i.test(document.localPath)
  );
}

/**
 * Portals routinely list an agenda link before the agenda itself is posted, and
 * answer 404/410 until it appears. That is the portal's publication schedule,
 * not a broken ingestion request, so it must not fail the results-coverage gate
 * for a meeting that has not happened yet. Every other status — including 403,
 * which usually means a real block — stays a hard error.
 */
function isUnpublishedAgendaDocument(document: PrimeGovMeeting["documents"][number]) {
  return /\bHTTP\s+(?:404|410)\b/i.test(String(document.downloadError || ""));
}

function isUpcomingMeeting(meeting: PrimeGovMeeting) {
  return (
    meeting.status === "Upcoming" ||
    meeting.section === "Upcoming Meetings" ||
    meeting.section === "Current And Upcoming Meetings"
  );
}

function unpublishedUpcomingAgendaDocuments(meeting: PrimeGovMeeting) {
  if (meeting.hasHtmlAgenda || !isUpcomingMeeting(meeting)) return [];
  const agendaDocuments = meeting.documents.filter(
    (document) =>
      AGENDA_DOCUMENT_TYPES.has(document.type) &&
      // Match the coverage gate, which already treats a 0-byte placeholder as
      // an unpublished document rather than a failed request.
      !/empty unpublished placeholder/i.test(String(document.downloadError || ""))
  );
  return agendaDocuments.length > 0 &&
    agendaDocuments.every(isUnpublishedAgendaDocument)
    ? agendaDocuments
    : [];
}

export function agendaIngestionWarnings(meetings: PrimeGovMeeting[]) {
  const warnings: string[] = [];
  for (const meeting of meetings) {
    const scanned = meeting.documents.filter(
      (document) =>
        AGENDA_DOCUMENT_TYPES.has(document.type) &&
        isDownloadedScannedPdf(document)
    );
    if (scanned.length > 0) {
      warnings.push(
        `Agenda OCR warning for ${meeting.title}: ${scanned.length} downloaded agenda document(s) are image-only; official links remain available.`
      );
    }

    const unpublished = unpublishedUpcomingAgendaDocuments(meeting);
    if (unpublished.length > 0) {
      warnings.push(
        `Agenda not yet published for ${meeting.title}: ${unpublished.length} agenda document(s) returned HTTP 404/410 for an upcoming meeting; official links remain available.`
      );
    }
  }
  return warnings;
}

export function agendaIngestionErrors(meetings: PrimeGovMeeting[]) {
  const errors: string[] = [];

  for (const meeting of meetings) {
    // A stale agenda or packet may remain published after the cancellation notice.
    // CivicClerk can also label a short cancellation PDF as an agenda while leaving
    // the event card itself active, so inspect already-extracted official text here.
    const hasOfficialCancellationNotice = meeting.documents.some((document) =>
      isCancellationNoticeText(document.extractedText || "")
    );
    if (isMeetingCancelled(meeting) || hasOfficialCancellationNotice) continue;

    const agendaDocuments = meeting.documents.filter(
      (document) =>
        AGENDA_DOCUMENT_TYPES.has(document.type) &&
        !/empty unpublished placeholder/i.test(String(document.downloadError || ""))
    );
    const hasDiscoveredAgenda = meeting.hasHtmlAgenda || agendaDocuments.length > 0;
    if (!hasDiscoveredAgenda) continue;

    const hasStructuredOfficialItems = Boolean(meeting.items?.length);
    const hasUsableHtmlAgenda =
      isUsablePrimeGovHtmlAgendaText(meeting.htmlAgendaText || "") &&
      isUsableOfficialSourceText(meeting.htmlAgendaText, 500);
    const hasUsableAgendaDocument = agendaDocuments.some(
      (document) =>
        document.type !== "HTML Agenda" &&
        hasUsableOfficialDocumentText(
          document,
          agendaDocumentMinimumCharacters(document.type)
        )
    );
    if (hasStructuredOfficialItems || hasUsableHtmlAgenda || hasUsableAgendaDocument) {
      continue;
    }

    // A successfully downloaded image-only PDF is a legitimate official
    // source, not a broken ingestion request. Keep it visible as an OCR warning
    // without failing the entire jurisdiction's results-coverage gate.
    if (agendaDocuments.some(isDownloadedScannedPdf)) continue;

    // Same for an upcoming meeting whose agenda has not been posted yet.
    if (unpublishedUpcomingAgendaDocuments(meeting).length > 0) continue;

    const documentCount = Math.max(agendaDocuments.length, 1);
    errors.push(
      `Agenda ingestion incomplete for ${meeting.title}: ${documentCount} published agenda document(s) had no usable official text.`
    );
  }

  return errors;
}

function createDeadline(maxRuntimeMinutes?: number) {
  if (!maxRuntimeMinutes || maxRuntimeMinutes <= 0) return null;

  const deadlineAt = Date.now() + maxRuntimeMinutes * 60_000;
  return {
    exceeded() {
      return Date.now() >= deadlineAt;
    },
    remainingMilliseconds() {
      return Math.max(0, deadlineAt - Date.now());
    },
    remainingMinutes() {
      return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 60_000));
    }
  };
}

function getMaxConsecutiveRateLimitFailures() {
  const raw = process.env.GROQ_MAX_CONSECUTIVE_RATE_LIMITS;
  if (!raw) return 2;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 2;
}

export function shouldReconcileMinutesWithoutGeneratingCards(
  meeting: LlmReadyMeeting,
  existingCardCount: number
) {
  return (
    existingCardCount > 0 &&
    meeting.documents.some(
      (document) =>
        ["Minutes", "Accessible Minutes"].includes(document.type) &&
        hasUsableOfficialDocumentText(document)
    )
  );
}

export function shouldSkipUnchangedSummary(
  sourceHash: string | null,
  summarizedSourceHash: string | null,
  existingCardCount = 1,
  agendaItemCount = 0,
  compatibleSourceHashes: string[] = []
) {
  return Boolean(
    sourceHash &&
      summarizedSourceHash &&
      (summarizedSourceHash === sourceHash ||
        compatibleSourceHashes.includes(summarizedSourceHash)) &&
      (existingCardCount > 0 || agendaItemCount === 0)
  );
}

const RESULTS_COVERAGE_ERROR_PATTERN =
  /Outcome coverage incomplete|Decision outcome reconciliation failed|Agenda ingestion incomplete|Minutes ingestion incomplete|Summary coverage incomplete|LLM failed for|Pipeline stopped early/i;
const MISSING_SUMMARY_PROVIDER_ERROR_PATTERN =
  /No LLM provider API key is configured; summaries were not generated/i;

export function filterResultsCoverageErrors(
  errors: string[],
  options: Pick<RunSimpleCityPipelineOptions, "persist" | "summarize">
) {
  return errors.filter(
    (error) =>
      RESULTS_COVERAGE_ERROR_PATTERN.test(error) ||
      (options.persist !== false &&
        options.summarize !== false &&
        MISSING_SUMMARY_PROVIDER_ERROR_PATTERN.test(error))
  );
}

export function formatResultsCoverageFailure(errors: string[]) {
  const counts = {
    ingestion: 0,
    matching: 0,
    summarization: 0,
    deadline: 0,
    configuration: 0,
    other: 0
  };

  for (const error of errors) {
    if (/Agenda ingestion incomplete|Minutes ingestion incomplete/i.test(error)) {
      counts.ingestion += 1;
    } else if (/Outcome coverage incomplete|Decision outcome reconciliation failed/i.test(error)) {
      counts.matching += 1;
    } else if (/Summary coverage incomplete|LLM failed for/i.test(error)) {
      counts.summarization += 1;
    } else if (/Pipeline stopped early/i.test(error)) {
      counts.deadline += 1;
    } else if (/No LLM provider API key is configured/i.test(error)) {
      counts.configuration += 1;
    } else {
      counts.other += 1;
    }
  }

  const breakdown = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${category} ${count}`)
    .join(", ");
  return `Results coverage gate failed with ${errors.length} error(s)${
    breakdown ? `: ${breakdown}` : ""
  }.`;
}

export function runSimpleCityPipeline(
  options: RunSimpleCityPipelineOptions = {}
): Promise<PipelineResult> {
  const jurisdiction = resolvePipelineJurisdiction(options.jurisdiction);
  return runWithLlmProcessBudget(
    () => runSimpleCityPipelineInternal(options),
    getPipelineLlmBudgetLimits(jurisdiction.slug, options.monthsBack)
  );
}

const HIGH_VOLUME_LLM_JURISDICTIONS = new Set<JurisdictionSlug>([
  "san-francisco",
  "san-mateo-county",
  "santa-clara-county",
  "santa-barbara-county"
]);

/**
 * These are safety ceilings, not quotas. Normal incremental runs should finish
 * far below them. Longer lookbacks get extra headroom because they intentionally
 * inspect more meetings, while high-volume county/large-city sources commonly
 * contain more agenda items and attachments per meeting.
 */
export function getPipelineLlmBudgetLimits(
  jurisdiction: JurisdictionSlug,
  monthsBack = 1
) {
  const highVolume = HIGH_VOLUME_LLM_JURISDICTIONS.has(jurisdiction);
  const extendedLookback = monthsBack >= 2;

  if (highVolume && extendedLookback) return { requests: 120, tokens: 750_000 };
  if (extendedLookback) return { requests: 90, tokens: 550_000 };
  if (highVolume) return { requests: 80, tokens: 500_000 };
  return { requests: 60, tokens: 350_000 };
}

async function runSimpleCityPipelineInternal(
  options: RunSimpleCityPipelineOptions = {}
): Promise<PipelineResult> {
  const jurisdiction = resolvePipelineJurisdiction(options.jurisdiction);
  const deadline = createDeadline(options.maxRuntimeMinutes);
  let deadlineRecorded = false;
  let summaryGenerationAttempts = 0;
  let agendaItemRecoveryAttempts = 0;
  const logs: string[] = [];
  const errors: string[] = [];
  const log = (message: string) => {
    const publicMessage = redactPublicLogMessage(message);
    const line = `${new Date().toISOString()} [${jurisdiction.slug}] ${publicMessage}`;
    logs.push(line);
    options.log?.(publicMessage);
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
  const generateWithinPipelineBudget = async (
    meeting: LlmReadyMeeting,
    kind: "meeting" | "agenda-item-recovery"
  ) => {
    if (recordDeadline("LLM summarization")) {
      throw new Error("Pipeline deadline reached before this LLM request started.");
    }

    summaryGenerationAttempts += 1;
    if (kind === "agenda-item-recovery") agendaItemRecoveryAttempts += 1;
    const remainingMs = deadline?.remainingMilliseconds();
    const signal = remainingMs === undefined
      ? undefined
      : AbortSignal.timeout(Math.max(1, remainingMs));
    return generateSummaryForMeeting(meeting, {
      log,
      signal,
      shouldStop: deadlineExceeded
    });
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
          meetings: [],
          generatedSummaries: []
        };
      }
    }
  }

  const canPersist = Boolean(persist && supabase);
  let runId: string | null = null;
  let meetingsFound = 0;
  let documentsDownloaded = 0;
  let cardsGenerated = 0;
  const generatedSummaries: PipelineResult["generatedSummaries"] = [];
  let persistSummaries = canPersist;
  let persistenceFailed = false;

  if (persist && !supabase) {
    errors.push("Supabase service environment is not configured; persistence was skipped.");
    log("Supabase service environment is not configured; persistence will be skipped.");
  }

  if (canPersist && supabase) {
    const interruptedBefore = new Date(Date.now() - 60 * 1000).toISOString();
    const interruptedMessage =
      "Previous pipeline process stopped before it could finalize this run; a later run recovered it.";
    const { error: interruptedRunError } = await supabase
      .from("scraper_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        error: interruptedMessage
      })
      .eq("jurisdiction_slug", jurisdiction.slug)
      .eq("status", "running")
      .lt("started_at", interruptedBefore);

    if (interruptedRunError) {
      log(`Could not finalize interrupted scraper run records: ${interruptedRunError.message}`);
    }

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
          : jurisdiction.platform === "escribe"
            ? await scrapeEscribeMeetings({
                ...options,
                jurisdiction,
                portalUrl: options.portalUrl || jurisdiction.escribeUrl || jurisdiction.sourceUrl,
                documentOutputDir,
                scrapeHtmlAgendas: options.scrapeHtmlAgendas ?? true,
                downloadDocuments: options.downloadDocuments ?? true,
                shouldStop: deadlineExceeded,
                log
              })
          : jurisdiction.platform === "legistar"
          ? jurisdiction.slug === "santa-barbara-county"
            ? await scrapeSantaBarbaraCountyMeetings({
                ...options,
                jurisdiction,
                portalUrl: options.portalUrl || jurisdiction.legistarUrl || jurisdiction.sourceUrl,
                documentOutputDir,
                downloadDocuments: options.downloadDocuments ?? true,
                shouldStop: deadlineExceeded,
                log
              })
            : await scrapeLegistarMeetings({
              ...options,
              jurisdiction,
              portalUrl: options.portalUrl || jurisdiction.legistarUrl || jurisdiction.sourceUrl,
              documentOutputDir,
              downloadDocuments: options.downloadDocuments ?? true,
              shouldStop: deadlineExceeded,
              log
            })
          : jurisdiction.platform === "civicclerk"
            ? await scrapeCivicClerkMeetings({
                ...options,
                jurisdiction,
                portalUrl:
                  options.portalUrl || jurisdiction.civicClerkUrl || jurisdiction.sourceUrl,
                documentOutputDir,
                downloadDocuments: options.downloadDocuments ?? true,
                shouldStop: deadlineExceeded,
                log
              })
          : jurisdiction.platform === "agenda-online"
            ? await scrapeAgendaOnlineMeetings({
                ...options,
                jurisdiction,
                portalUrl: options.portalUrl || jurisdiction.sourceUrl,
                documentOutputDir,
                downloadDocuments: options.downloadDocuments ?? true,
                shouldStop: deadlineExceeded,
                log
              })
          : jurisdiction.platform === "simbli"
            ? await scrapeSimbliMeetings({
                ...options,
                jurisdiction,
                portalUrl: options.portalUrl || jurisdiction.simbliUrl || jurisdiction.sourceUrl,
                documentOutputDir,
                downloadDocuments: options.downloadDocuments ?? true,
                shouldStop: deadlineExceeded,
                log
              })
          : jurisdiction.platform === "official-site"
            ? jurisdiction.slug === "east-palo-alto"
              ? await scrapeEastPaloAltoMeetings({
                  ...options,
                  jurisdiction,
                  portalUrl: options.portalUrl || jurisdiction.officialSiteUrl || jurisdiction.sourceUrl,
                  documentOutputDir,
                  downloadDocuments: options.downloadDocuments ?? true,
                  shouldStop: deadlineExceeded,
                  log
                })
              : await scrapeMenloParkMeetings({
                ...options,
                jurisdiction,
                portalUrl: options.portalUrl || jurisdiction.officialSiteUrl || jurisdiction.sourceUrl,
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
    for (const scrapeError of scrapeResult.errors || []) {
      errors.push(scrapeError);
      log(scrapeError);
    }

    meetingsFound = scrapeResult.totalMeetingCount;
    documentsDownloaded = scrapeResult.meetings
      .flatMap((meeting) => meeting.documents)
      .filter((doc) => Boolean(doc.localPath)).length;

    if (!recordDeadline("PDF text extraction")) {
      log("Extracting PDF text.");
      const pdfNotes = await extractPdfTextForMeetings(scrapeResult.meetings);
      for (const note of pdfNotes) log(note);

      if (jurisdiction.slug === "santa-barbara-county") {
        const itemCount = enrichSantaBarbaraPlanningCommissionItems(scrapeResult.meetings);
        log(`Parsed ${itemCount} Santa Barbara County Planning Commission agenda item(s).`);
      }

      if (jurisdiction.slug === "menlo-park") {
        const enrichedCount = enrichMenloParkMeetingTimesFromAgendaText(scrapeResult.meetings);
        if (enrichedCount > 0) {
          log(`Extracted Menlo Park meeting times from agenda documents for ${enrichedCount} meeting(s).`);
        }
      }
    }

    if (canPersist && supabase) {
      try {
        const restored = await restoreArchivedDocumentExtractions(
          supabase,
          scrapeResult.meetings,
          jurisdiction
        );
        if (restored > 0) {
          log(
            `Restored ${restored} unchanged official document extraction(s) from the database after transient download/parser misses.`
          );
        }
      } catch (error) {
        log(
          `Could not restore archived document text; current scrape data will be used: ${
            error instanceof Error ? error.message : "Unknown archived extraction error"
          }`
        );
      }
    }

    for (const agendaError of agendaIngestionErrors(scrapeResult.meetings)) {
      errors.push(agendaError);
      log(agendaError);
    }
    for (const agendaWarning of agendaIngestionWarnings(scrapeResult.meetings)) {
      log(agendaWarning);
    }
    for (const minutesError of minutesIngestionErrors(scrapeResult.meetings)) {
      errors.push(minutesError);
      log(minutesError);
    }
    for (const minutesWarning of minutesIngestionWarnings(scrapeResult.meetings)) {
      log(minutesWarning);
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
        const reconciliation = await reconcileMeetingRecords(supabase, jurisdiction);
        if (
          reconciliation.staleStatusesUpdated > 0 ||
          reconciliation.futurePastStatusesUpdated > 0 ||
          reconciliation.orphanDuplicatesDeleted > 0 ||
          reconciliation.protectedDuplicatesSkipped > 0
        ) {
          log(
            `Reconciled meetings: ${reconciliation.staleStatusesUpdated} stale status(es) updated, ` +
              `${reconciliation.futurePastStatusesUpdated} future meeting(s) corrected from past to upcoming, ` +
              `${reconciliation.orphanDuplicatesDeleted} orphan duplicate(s) deleted, ` +
              `${reconciliation.protectedDuplicatesSkipped} duplicate(s) retained because they own published data.`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown persistence error";
        errors.push(message);
        log(`Persistence failed; continuing without database writes: ${message}`);
        upserted = [];
        persistSummaries = false;
        persistenceFailed = true;
      }
    } else {
      log("Skipping Supabase persistence.");
    }

    let outcomesUpserted = 0;
    let outcomesRejectedAmbiguous = 0;
    let resultItemsFound = 0;
    let resultItemsMatched = 0;
    let resultItemsUnmatched = 0;
    let resultCardsFound = 0;
    let resultCardsMatched = 0;
    let resultCardsUnmatched = 0;
    let duplicateCardsDetected = 0;
    let duplicateCardsResolved = 0;
    let requiredAgendaItems = 0;
    let detailedAgendaItems = 0;
    let fallbackAgendaItems = 0;
    const reconciledOutcomeMeetingIds = new Set<string>();
    const reconcileOutcomesForItem = async (item: {
      id: string;
      meeting: LlmReadyMeeting;
      sourceHash?: string | null;
    }) => {
      if (
        deadlineExceeded() ||
        !canPersist ||
        !supabase ||
        !item.id ||
        reconciledOutcomeMeetingIds.has(item.id)
      ) {
        return "skipped" as const;
      }
      // One attempt per meeting per run. Incomplete work remains eligible on a
      // future run because its full source hash is not checkpointed below.
      reconciledOutcomeMeetingIds.add(item.id);
      try {
        const reconciliation = await reconcileDecisionOutcomesForMeeting(
          supabase,
          item.id,
          item.meeting,
          jurisdiction,
          {
            explainWithLlm: !isLlmProcessBudgetExhausted(),
            translateWithLlm: !isLlmProcessBudgetExhausted(),
            log
          }
        );
        outcomesUpserted += reconciliation.outcomesUpserted;
        outcomesRejectedAmbiguous += reconciliation.outcomesRejectedAmbiguous;
        resultItemsFound += reconciliation.resultItemsFound;
        resultItemsMatched += reconciliation.resultItemsMatched;
        resultItemsUnmatched += reconciliation.resultItemsUnmatched;
        resultCardsFound += reconciliation.resultCardsFound;
        resultCardsMatched += reconciliation.resultCardsMatched;
        resultCardsUnmatched += reconciliation.resultCardsUnmatched;
        duplicateCardsDetected += reconciliation.duplicateCardsDetected;
        duplicateCardsResolved += reconciliation.duplicateCardsResolved;
        if (!reconciliation.complete && reconciliation.resultCardsFound > 0) {
          const coverageError =
            `Outcome coverage incomplete for ${item.meeting.title}: matched ${reconciliation.resultCardsMatched} of ${reconciliation.resultCardsFound} decision card(s) with official results; ${reconciliation.outcomesRejectedAmbiguous} ambiguous card assignment(s).`;
          errors.push(coverageError);
          log(coverageError);
        }
        if (reconciliation.complete && item.sourceHash) {
          await setMeetingSummarizedSourceHash(supabase, item.id, item.sourceHash);
        }
        return reconciliation.complete ? "complete" as const : "incomplete" as const;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown decision outcome error";
        errors.push(`${item.meeting.title}: ${message}`);
        log(`Decision outcome reconciliation failed for ${item.meeting.title}: ${message}`);
        return "failed" as const;
      }
    };

    if (shouldSummarize && !recordDeadline("LLM summarization")) {
      if (!hasSummaryProviderConfig()) {
        errors.push("No LLM provider API key is configured; summaries were not generated.");
        log("Configure OPENROUTER_API_KEY or a GROQ_API_KEY to generate LLM summaries.");
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
              summarySourceHash: null,
              compatibleSummarySourceHashes: [],
              compatibleSourceHashes: [],
              summarizedSourceHash: null,
              summarizedSummarySourceHash: null,
              existingCardCount: 0
            }));
        let consecutiveRateLimitFailures = 0;
        const maxConsecutiveRateLimitFailures = getMaxConsecutiveRateLimitFailures();
        const summaryConcurrency = Math.min(2, Math.max(1, summaryTargets.length));
        const summaryProgress = {
          completed: 0,
          generated: 0,
          cancelled: 0,
          unchanged: 0,
          minutesOnly: 0,
          outcomesOnly: 0,
          noInput: 0,
          failed: 0
        };
        const initialLlmBudget = getLlmProcessBudgetUsage();
        log(
          `Summary queue: ${summaryTargets.length} meeting(s); ` +
          `OpenRouter safety ceiling ${initialLlmBudget.requestLimit} requests and ` +
          `${initialLlmBudget.tokenLimit} estimated/actual tokens for this jurisdiction run.`
        );
        if (summaryConcurrency > 1) {
          log(`Summarizing up to ${summaryConcurrency} meetings concurrently.`);
        }

        const summarizeTarget = async (
          item: (typeof summaryTargets)[number]
        ): Promise<"ok" | "rate-limit" | "budget-exhausted" | null> => {
          if (isMeetingCancelled(item.meeting)) {
            if (item.id) reconciledOutcomeMeetingIds.add(item.id);
            summaryProgress.cancelled += 1;
            log(
              item.existingCardCount > 0
                ? `Skipping ${item.meeting.title}; meeting is cancelled and ${item.existingCardCount} existing historical card(s) were retained.`
                : `Skipping ${item.meeting.title}; meeting is cancelled and no decision cards will be generated.`
            );
            return null;
          }

          try {
            const shouldAppendToExisting =
              Boolean(persistSummaries && supabase && item.id && item.existingCardCount > 0);

            if (
              shouldSkipUnchangedSummary(
                item.sourceHash,
                item.summarizedSourceHash,
                item.existingCardCount,
                item.meeting.items?.length || 0,
                item.compatibleSourceHashes
              )
            ) {
              let migratedLegacyHash = false;
              if (
                persistSummaries &&
                  supabase &&
                  item.id &&
                  item.sourceHash &&
                  item.summarizedSourceHash &&
                  item.summarizedSourceHash !== item.sourceHash &&
                  item.compatibleSourceHashes.includes(item.summarizedSourceHash)
              ) {
                await setMeetingSummarizedSourceHash(
                  supabase,
                  item.id,
                  item.sourceHash,
                  item.summarySourceHash
                );
                migratedLegacyHash = true;
              } else if (
                persistSummaries &&
                  supabase &&
                  item.id &&
                  item.summarySourceHash &&
                  item.summarizedSummarySourceHash !== item.summarySourceHash
              ) {
                // The full source was already completed, so a missing or newly
                // versioned summary hash is metadata migration—not paid work.
                await setMeetingSummarizedSourceHash(
                  supabase,
                  item.id,
                  null,
                  item.summarySourceHash
                );
              }
              log(
                item.existingCardCount > 0
                  ? `Skipping ${item.meeting.title}; source unchanged and cards already exist.${migratedLegacyHash ? " Upgraded its legacy source hash." : ""}`
                  : `Skipping ${item.meeting.title}; source unchanged and the prior summary produced no cards.`
              );
              summaryProgress.unchanged += 1;
              // An identical source hash means the same official results were
              // already reconciled. Mark this meeting handled so the final
              // safety pass cannot repeat historical explanation/translation
              // work during an extended Monday lookback.
              if (item.id) reconciledOutcomeMeetingIds.add(item.id);
              return null;
            }

            if (!item.meeting.llmInputText) {
              summaryProgress.noInput += 1;
              log(`Skipping ${item.meeting.title}; no LLM input text.`);
              if (persistSummaries) await reconcileOutcomesForItem(item);
              return null;
            }

            if (
              shouldAppendToExisting &&
              supabase &&
              shouldSkipUnchangedSummary(
                item.summarySourceHash,
                item.summarizedSummarySourceHash,
                item.existingCardCount,
                item.meeting.items?.length || 0,
                item.compatibleSummarySourceHashes
              )
            ) {
              if (
                item.summarySourceHash &&
                item.summarizedSummarySourceHash &&
                item.summarizedSummarySourceHash !== item.summarySourceHash &&
                item.compatibleSummarySourceHashes.includes(
                  item.summarizedSummarySourceHash
                )
              ) {
                await setMeetingSummarizedSourceHash(
                  supabase,
                  item.id,
                  null,
                  item.summarySourceHash
                );
              }
              const minutesOnly = shouldReconcileMinutesWithoutGeneratingCards(
                item.meeting,
                item.existingCardCount
              );
              log(minutesOnly
                ? `Kept ${item.existingCardCount} existing cards for ${item.meeting.title}; changed official minutes will update those cards without generating duplicates.`
                : `Kept ${item.existingCardCount} existing cards for ${item.meeting.title}; the agenda-summary source is unchanged, so only official outcomes will be reconciled.`
              );
              if (minutesOnly) summaryProgress.minutesOnly += 1;
              else summaryProgress.outcomesOnly += 1;
              await reconcileOutcomesForItem(item);
              return null;
            }

            if (
              item.sourceHash &&
              item.summarizedSourceHash &&
              item.summarizedSourceHash !== item.sourceHash
            ) {
              const components = meetingSourceHashComponents(item.meeting);
              log(
                `Re-summarizing ${item.meeting.title}; the official source hash changed ` +
                `(stored ${item.summarizedSourceHash.slice(0, 10)}, current ${item.sourceHash.slice(0, 10)}). ` +
                `Component fingerprints: metadata ${components.metadata}, llmInput ${components.llmInput}, ` +
                `documents ${components.documents}, items ${components.items}. ` +
                "Compare these across runs to identify a component that churns without a real source change."
              );
            }

            let initialSummary: Awaited<ReturnType<typeof generateSummaryForMeeting>> | null = null;
            let initialSummaryError: unknown = null;
            try {
              initialSummary = await generateWithinPipelineBudget(item.meeting, "meeting");
            } catch (error) {
              initialSummaryError = error;
            }

            const coverage = await completeAgendaItemCoverage(
              item.meeting,
              initialSummary,
              {
                initialGenerationFailed: Boolean(initialSummaryError),
                generate: initialSummaryError && (
                  isLlmRateLimitError(initialSummaryError) ||
                  isLlmProcessBudgetExceededError(initialSummaryError)
                )
                  ? undefined
                  : (retryMeeting) =>
                      generateWithinPipelineBudget(retryMeeting, "agenda-item-recovery")
              }
            );
            const { summary, raw } = coverage;
            const requiredItemCount = agendaItemsRequiringCards(item.meeting).length;
            requiredAgendaItems += requiredItemCount;
            fallbackAgendaItems += coverage.fallbackItemIds.length;
            detailedAgendaItems += Math.max(
              0,
              requiredItemCount - coverage.fallbackItemIds.length
            );
            if (requiredItemCount > 0) {
              log(
                `Summary coverage for ${item.meeting.title}: ${requiredItemCount - coverage.fallbackItemIds.length} detailed, ${coverage.fallbackItemIds.length} official-source fallback, ${requiredItemCount} required.`
              );
            }

            if (coverage.retriedItemIds.length > 0) {
              log(
                `Retried ${coverage.retriedItemIds.length} uncovered agenda item(s) in bounded recovery batches for ${item.meeting.title}.`
              );
            }
            for (const retryError of coverage.retryErrors) {
              log(`Agenda-item summary retry did not complete for ${item.meeting.title}: ${retryError}`);
            }
            if (coverage.fallbackItemIds.length > 0) {
              const message =
                `Published official-source fallback coverage for ${coverage.fallbackItemIds.length} of ${requiredItemCount} required agenda item(s) in ${item.meeting.title}; detailed summaries will be retried on a future run.`;
              log(`Summary warning: ${message}`);
            }
            if (initialSummaryError) {
              const detail = initialSummaryError instanceof Error
                ? initialSummaryError.message
                : "Unknown LLM error";
              const message =
                `Detailed meeting summary was unavailable for ${item.meeting.title}; item-level coverage recovery continued: ${detail}`;
              log(`Summary warning: ${message}`);
            }

            // Recovery has already been attempted for every uncovered item.
            // Checkpoint the agenda-summary hash with the cards so unchanged
            // fallback coverage is not regenerated. The full source hash is
            // checkpointed separately only after outcome reconciliation.
            if (persistSummaries && supabase && item.id) {
              const inserted = shouldAppendToExisting
                ? await appendSummaryCardsForMeeting(
                    supabase,
                    item.id,
                    summary,
                    raw,
                    {
                      agendaItems: item.meeting.items,
                      authoritativeSourceItemIds:
                        authoritativeAgendaItemSourceIds(item.meeting) || undefined,
                      jurisdiction,
                      summarySourceHash: item.summarySourceHash
                    }
                  )
                : await replaceSummaryCardsForMeeting(
                    supabase,
                    item.id,
                    summary,
                    raw,
                    {
                      agendaItems: item.meeting.items,
                      allowEmptyReplacement: true,
                      authoritativeSourceItemIds:
                        authoritativeAgendaItemSourceIds(item.meeting) || undefined,
                      jurisdiction,
                      summarySourceHash: item.summarySourceHash
                    }
                  );
              if (shouldAppendToExisting) {
                log(`Reconciled ${inserted.length} source-identified card(s) while retaining unmatched existing cards for ${item.meeting.title}.`);
              }
              cardsGenerated += inserted.length;
              await reconcileOutcomesForItem(item);
            } else {
              cardsGenerated += summary.cards.length;
              generatedSummaries.push({
                meetingId: item.meeting.id,
                meetingTitle: item.meeting.title,
                dateText: item.meeting.dateText,
                summary
              });
            }
            summaryProgress.generated += 1;
            if (initialSummaryError && isLlmProcessBudgetExceededError(initialSummaryError)) {
              return "budget-exhausted";
            }
            return initialSummaryError && isLlmRateLimitError(initialSummaryError)
              ? "rate-limit"
              : "ok";
          } catch (error) {
            summaryProgress.failed += 1;
            const message = error instanceof Error ? error.message : "Unknown LLM error";
            errors.push(`LLM failed for ${item.meeting.title}: ${message}`);
            log(`LLM failed for ${item.meeting.title}: ${message}`);
            if (persistSummaries && item.existingCardCount > 0) {
              await reconcileOutcomesForItem(item);
            }
            if (isLlmProcessBudgetExceededError(error)) return "budget-exhausted";
            return isLlmRateLimitError(error) ? "rate-limit" : "ok";
          }
        };

        let stopSummaries = false;
        let nextSummaryIndex = 0;
        const runSummaryWorker = async () => {
          while (!stopSummaries) {
            if (recordDeadline("LLM summarization")) {
              stopSummaries = true;
              return;
            }
            const item = summaryTargets[nextSummaryIndex];
            nextSummaryIndex += 1;
            if (!item) return;

            let outcome: "ok" | "rate-limit" | "budget-exhausted" | null = null;
            try {
              outcome = await summarizeTarget(item);
            } finally {
              summaryProgress.completed += 1;
              const usage = getLlmProcessBudgetUsage();
              log(
                `Summary progress: ${summaryProgress.completed}/${summaryTargets.length} meeting(s) processed; ` +
                `${Math.max(0, summaryTargets.length - summaryProgress.completed)} remaining ` +
                `(generated ${summaryProgress.generated}, cancelled ${summaryProgress.cancelled}, ` +
                `unchanged ${summaryProgress.unchanged}, minutes-only ${summaryProgress.minutesOnly}, ` +
                `outcomes-only ${summaryProgress.outcomesOnly}, ` +
                `no-input ${summaryProgress.noInput}, failed ${summaryProgress.failed}). ` +
                `OpenRouter budget: requests ${usage.requests}/${usage.requestLimit}; ` +
                `estimated/actual tokens ${usage.tokens}/${usage.tokenLimit}.`
              );
            }
            if (outcome === "budget-exhausted") {
              log(
                "Stopping detailed LLM summaries because the OpenRouter safety budget is exhausted; completed work and official-source fallbacks are retained."
              );
              stopSummaries = true;
              return;
            }
            if (outcome === null) continue;
            consecutiveRateLimitFailures = outcome === "rate-limit"
              ? consecutiveRateLimitFailures + 1
              : 0;
            if (consecutiveRateLimitFailures >= maxConsecutiveRateLimitFailures) {
              const stopMessage =
                "Stopping detailed LLM summaries after repeated provider rate-limit responses; official-source fallback cards preserve agenda-item coverage.";
              errors.push(stopMessage);
              log(stopMessage);
              stopSummaries = true;
              return;
            }
          }
        };
        await Promise.all(
          Array.from({ length: summaryConcurrency }, () => runSummaryWorker())
        );
        if (summaryProgress.completed < summaryTargets.length) {
          log(
            `Summary queue stopped with ${summaryTargets.length - summaryProgress.completed} meeting(s) still pending; ` +
            "they remain eligible for a future pipeline run."
          );
        }
      }
    }

    if (requiredAgendaItems > 0) {
      log(
        `Decision-card coverage: ${detailedAgendaItems} detailed and ${fallbackAgendaItems} official-source fallback card(s) across ${requiredAgendaItems} required agenda item(s).`
      );
    }

    if (canPersist && supabase && upserted.length > 0) {
      for (const item of upserted) {
        // The summary workers already reconciled unchanged/cancelled meetings.
        // Re-check here because a provider stop can leave later queue entries
        // untouched; the final safety pass must not turn those historical
        // entries into another round of result explanation/translation calls.
        if (
          isMeetingCancelled(item.meeting) ||
          shouldSkipUnchangedSummary(
            item.sourceHash,
            item.summarizedSourceHash,
            item.existingCardCount,
            item.meeting.items?.length || 0,
            item.compatibleSourceHashes
          )
        ) {
          continue;
        }
        if (recordDeadline("decision outcome reconciliation")) break;
        await reconcileOutcomesForItem(item);
      }
      if (outcomesUpserted > 0) {
        log(`Published ${outcomesUpserted} verified decision outcome update(s) from official meeting records.`);
      }
      if (outcomesRejectedAmbiguous > 0) {
        log(
          `Withheld ${outcomesRejectedAmbiguous} decision outcome match(es) because one official item matched multiple cards.`
        );
      }
      if (resultItemsFound > 0) {
        log(
          `Decision outcome coverage: matched ${resultItemsMatched} of ${resultItemsFound} result-bearing agenda item(s); ${resultItemsUnmatched} unmatched.`
        );
      }
      if (resultCardsFound > 0) {
        log(
          `Decision-card result coverage: matched ${resultCardsMatched} of ${resultCardsFound} card(s) with official results; ${resultCardsUnmatched} unmatched.`
        );
      }
      if (duplicateCardsDetected > 0) {
        log(
          `Detected ${duplicateCardsDetected} duplicate decision card(s); resolved ${duplicateCardsResolved} using official-source or creation-time evidence.`
        );
      }
    }

    const status = persistenceFailed
      ? "failed"
      : errors.length > 0
        ? "success_with_errors"
        : "success";
    log(
      `Summary generation work: ${summaryGenerationAttempts} request group(s), ` +
      `including ${agendaItemRecoveryAttempts} agenda-item recovery group(s).`
    );
    log(formatLlmProcessRunSummary());
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
      meetings: llmReadyMeetings,
      generatedSummaries
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    errors.push(message);
    log(`Pipeline failed: ${message}`);
    log(formatLlmProcessRunSummary());

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
      meetings: [],
      generatedSummaries
    };
  }
}

export function runJurisdictionPipelines(
  selection: JurisdictionSelection = ALL_JURISDICTIONS_SLUG,
  options: Omit<RunSimpleCityPipelineOptions, "jurisdiction"> = {}
): Promise<MultiJurisdictionPipelineResult> {
  return runJurisdictionPipelinesInternal(selection, options);
}

async function runJurisdictionPipelinesInternal(
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
      const publicMessage = redactPublicLogMessage(message);
      const failed: PipelineResult = {
        runId: null,
        status: "failed",
        logs: [`${new Date().toISOString()} [${jurisdiction.slug}] ${publicMessage}`],
        errors: [message],
        meetingsFound: 0,
        documentsDownloaded: 0,
        cardsGenerated: 0,
        meetings: [],
        generatedSummaries: []
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
