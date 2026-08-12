import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";
import {
  extractMeetingWideParticipationContext,
  formatAgendaItemContexts,
  MEETING_WIDE_CONTEXT_HEADING
} from "@/lib/scraper/agendaItemContext";
import { areLikelySameAgendaItem } from "@/lib/utils/agendaItemIdentity";
import { attachSourceItemIds } from "@/lib/utils/cardSourceIdentity";
import {
  fetchLlmResponse,
  getLlmProvidersForInput,
  hasConfiguredLlmProvider,
  LlmProcessBudgetExceededError,
  LLM_OPTIONAL_REQUEST_TIMEOUT_MS,
  LLM_REQUEST_TIMEOUT_MS,
  providerCompletionTokenLimit,
  providerSpecificRequestFields,
  type LlmProvider
} from "./provider";
import { buildSimpleCityUserPrompt, SIMPLECITY_SYSTEM_PROMPT } from "./prompts";
import {
  parseAndValidateSummary,
  parsePossiblyWrappedJson,
  validationOptionsForMeeting,
  type SummaryValidationIssue
} from "./validateSummary";
import {
  applyTopicValidation,
  buildTopicValidationPrompt,
  parseTopicValidation,
  topicValidationCandidates,
  TOPIC_VALIDATION_SYSTEM_PROMPT,
  type TopicValidationCandidate
} from "./topicValidation";

export type GenerateSummaryOptions = {
  log?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
  requestGroup?: string;
  signal?: AbortSignal;
  shouldStop?: () => boolean;
};

type SummaryRequestResult = {
  summary: SimpleCitySummary;
  raw: unknown;
  validationIssues: SummaryValidationIssue[];
};

type SummaryProvider = LlmProvider;

class SummaryProviderRequestError extends Error {
  provider: SummaryProvider["name"];
  status: number;
  retryable: boolean;
  retryAfterMs: number | null;

  constructor(provider: SummaryProvider["name"], status: number, text: string, retryAfterMs: number | null) {
    super(`${provider} request failed with ${status}: ${text.slice(0, 500)}`);
    this.name = "SummaryProviderRequestError";
    this.provider = provider;
    this.status = status;
    this.retryable = status === 429 || status >= 500 || text.toLowerCase().includes("rate-limited");
    this.retryAfterMs = retryAfterMs;
  }
}

const MAX_TOPIC_VALIDATION_PROMPT_CHARS = 60_000;
export const MAX_AGENDA_ITEM_BATCH_CHARS = 12_000;
export const MAX_AGENDA_ITEMS_PER_BATCH = 5;

export function buildAgendaItemSummaryBatches(meeting: LlmReadyMeeting): LlmReadyMeeting[] {
  if (meeting.status === "Cancelled" || !meeting.items?.length) return [meeting];

  // Keep shared attendance/comment instructions in every batch, but do not let
  // them crowd out the actual agenda-item evidence or recreate a large request.
  const meetingWideContext = extractMeetingWideParticipationContext(meeting.llmInputText).slice(0, 3500);
  const batchIntroduction =
    "Generate cards only for the official items in this batch. Do not create cards for neighboring or omitted items.";
  const sharedContextBlock = meetingWideContext
    ? [
        MEETING_WIDE_CONTEXT_HEADING,
        meetingWideContext
      ].join("\n")
    : "";
  const batchItemLimit = Math.max(
    2500,
    MAX_AGENDA_ITEM_BATCH_CHARS - sharedContextBlock.length - batchIntroduction.length - 200
  );
  const itemBatches: NonNullable<LlmReadyMeeting["items"]>[] = [];
  let currentItems: NonNullable<LlmReadyMeeting["items"]> = [];
  let currentLength = 0;

  for (const item of meeting.items) {
    const itemLength = formatAgendaItemContexts([item]).length;
    if (
      currentItems.length > 0 &&
      (currentLength + itemLength > batchItemLimit ||
        currentItems.length >= MAX_AGENDA_ITEMS_PER_BATCH)
    ) {
      itemBatches.push(currentItems);
      currentItems = [];
      currentLength = 0;
    }
    currentItems.push(item);
    currentLength += itemLength;
  }
  if (currentItems.length > 0) itemBatches.push(currentItems);

  return itemBatches.map((items, index) => ({
    ...meeting,
    items,
    llmInputText: [
      `Agenda-item batch ${index + 1} of ${itemBatches.length}. ${batchIntroduction}`,
      formatAgendaItemContexts(items),
      sharedContextBlock
    ].filter(Boolean).join("\n\n"),
    extractionNotes: [
      ...meeting.extractionNotes,
      `Summarizing structured agenda-item batch ${index + 1} of ${itemBatches.length}.`
    ]
  }));
}

function hasUsableSourceText(meeting: LlmReadyMeeting) {
  const input = meeting.llmInputText.trim();
  return meeting.status === "Cancelled" ? input.length > 0 : input.length >= 300;
}

function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason ?? new DOMException("The operation was aborted.", "AbortError")
    );
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(
        signal?.reason ?? new DOMException("The operation was aborted.", "AbortError")
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function parseNonNegativeEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getSummaryMaxAttempts() {
  const raw = process.env.LLM_SUMMARY_MAX_ATTEMPTS || process.env.GROQ_SUMMARY_MAX_ATTEMPTS;
  if (!raw) return 3;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
}

function parseRetryAfterMs(headers: Headers) {
  const raw = headers.get("retry-after");
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const retryAt = Date.parse(raw);
  if (!Number.isNaN(retryAt)) return Math.max(0, retryAt - Date.now());

  return null;
}

const GROQ_SUMMARY_MAX_COMPLETION_TOKENS = 3_000;
const GROQ_REPAIR_MAX_COMPLETION_TOKENS = 2_500;
const GROQ_TOPIC_MAX_COMPLETION_TOKENS = 2_000;

function getRotatedSummaryProviders(input: unknown, groqMaxCompletionTokens: number) {
  const providers = getLlmProvidersForInput(input, groqMaxCompletionTokens);
  if (providers.length === 0) {
    throw new Error("Missing LLM provider API key. Configure OpenRouter or Groq.");
  }
  return providers;
}

export function hasSummaryProviderConfig() {
  return hasConfiguredLlmProvider();
}

function canTryNextProvider(error: unknown) {
  if (error instanceof LlmProcessBudgetExceededError) return false;
  if (
    error &&
    typeof error === "object" &&
    "retryable" in error &&
    error.retryable === false
  ) return false;
  if (error instanceof SummaryProviderRequestError) return error.retryable;
  if (error instanceof Error && error.name === "AbortError") return true;
  return true;
}

function isRetryableSummaryError(error: unknown) {
  if (error instanceof LlmProcessBudgetExceededError) return false;
  if (
    error &&
    typeof error === "object" &&
    "retryable" in error &&
    error.retryable === false
  ) return false;
  if (error instanceof SummaryProviderRequestError) {
    if (!error.retryable) return false;
    if (/tokens per day limit exceeded|daily (?:token |request )?(?:limit|quota)/i.test(error.message)) {
      return false;
    }
    const maxRetryDelayMs = parseNonNegativeEnv("LLM_MAX_RETRY_DELAY_MS", 60_000);
    return error.retryAfterMs === null || error.retryAfterMs <= maxRetryDelayMs;
  }
  if (error instanceof Error && error.name === "AbortError") return true;
  return true;
}

function isSummaryProviderRequestError(error: unknown): error is SummaryProviderRequestError {
  return error instanceof SummaryProviderRequestError;
}

export function isLlmRateLimitError(error: unknown) {
  if (error instanceof SummaryProviderRequestError) return error.status === 429;
  if (!(error instanceof Error)) return false;
  return /\b429\b|rate-?limited|rate limit/i.test(error.message);
}

function retryDelayMs(error: unknown, attempt: number) {
  if (isSummaryProviderRequestError(error) && error.retryAfterMs !== null) return error.retryAfterMs;

  const baseMs = parseNonNegativeEnv(
    isLlmRateLimitError(error)
      ? "GROQ_RATE_LIMIT_RETRY_BASE_MS"
      : "GROQ_SUMMARY_RETRY_BASE_MS",
    isLlmRateLimitError(error) ? 30_000 : 5_000
  );

  return baseMs * attempt;
}

function summaryStopError(options: GenerateSummaryOptions) {
  if (options.signal?.reason instanceof Error) return options.signal.reason;
  return new Error("Pipeline deadline reached before the next LLM summary attempt.");
}

function summarizeValidationIssues(issues: SummaryValidationIssue[]) {
  return issues
    .slice(0, 6)
    .map((issue) => {
      const label = issue.agendaItem ? `${issue.agendaItem}: ` : "";
      const value = issue.value ? ` (${issue.value})` : "";
      return `- ${label}${issue.reason}${value}`;
    })
    .join("\n");
}

function validationRejections(issues: SummaryValidationIssue[]) {
  return issues.filter((issue) => issue.outcome !== "warning");
}

function shouldRegenerateSummary(meeting: LlmReadyMeeting, result: SummaryRequestResult) {
  if (validationRejections(result.validationIssues).length > 0) return false;
  return result.summary.cards.length === 0 && hasUsableSourceText(meeting);
}

function buildRegenerationGuidance(meeting: LlmReadyMeeting, result: SummaryRequestResult) {
  const issueSummary = result.validationIssues.length
    ? summarizeValidationIssues(result.validationIssues)
    : "- The previous response returned no cards even though usable source text was available.";

  return `Regenerate the SimpleCity JSON for this meeting.

The previous response could not be fully used:
${issueSummary}

Re-check the raw agenda text item by item. Include every non-routine, source-supported item with public impact. Also include transparency routine items when the source gives enough detail for residents to verify the record or understand participation, such as consequential minutes approvals, grouped consent-calendar summaries, agenda changes, public-comment instructions, meaningful staff updates, decision-making appointments, listed closed-session topics, relevant proclamations, cancellations, continuances, special meeting notices, and named ceremonial adjournments.

Keep the strict grounding rules: use only exact values visible in the provided text, write "Not listed in the source document." when a detail is missing, and use one of the official source URLs from the meeting metadata. If the source text is partial, noisy, row-only, or truncated, keep the card only when the core item is visible and set confidence to "medium" or "low". If there truly are no non-routine or transparency-worthy source-supported items, return an empty cards array.`;
}

function isBetterSummaryResult(candidate: SummaryRequestResult, current: SummaryRequestResult) {
  if (candidate.summary.cards.length !== current.summary.cards.length) {
    return candidate.summary.cards.length > current.summary.cards.length;
  }

  return (
    validationRejections(candidate.validationIssues).length <
    validationRejections(current.validationIssues).length
  );
}

function mergeValidatedSummaries(
  accepted: SimpleCitySummary,
  repaired: SimpleCitySummary
): SimpleCitySummary {
  const cards = [...accepted.cards];
  const spanishCards = [...(accepted.translations?.es?.cards || [])];
  const repairedSpanishCards = repaired.translations?.es?.cards || [];

  for (const [index, card] of repaired.cards.entries()) {
    const duplicate = cards.some(
      (existing) =>
        (existing.sourceItemId && existing.sourceItemId === card.sourceItemId) ||
        areLikelySameAgendaItem(existing.agendaItem, card.agendaItem)
    );
    if (duplicate) continue;
    cards.push(card);
    spanishCards.push(repairedSpanishCards[index] || null);
  }

  const spanishMeeting =
    accepted.translations?.es?.meeting || repaired.translations?.es?.meeting;
  const hasSpanish = Boolean(
    accepted.translations?.es || repaired.translations?.es
  );

  return {
    ...accepted,
    cards,
    translations: hasSpanish
      ? {
          es: {
            meeting: spanishMeeting,
            cards: spanishCards
          }
        }
      : undefined
  };
}

function repairableCardsFromResponse(content: string, issues: SummaryValidationIssue[]) {
  const parsed = parsePossiblyWrappedJson(content) as { cards?: unknown[] };
  const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
  const indexes = Array.from(
    new Set(
      issues
        .filter((issue) => issue.repairable && Number.isInteger(issue.cardIndex))
        .map((issue) => issue.cardIndex as number)
    )
  );
  return indexes.flatMap((index) =>
    index >= 0 && index < cards.length ? [{ index, card: cards[index] }] : []
  );
}

async function requestTargetedCardRepairs(
  meeting: LlmReadyMeeting,
  provider: SummaryProvider,
  rejectedCards: Array<{ index: number; card: unknown }>,
  issues: SummaryValidationIssue[],
  options: GenerateSummaryOptions
): Promise<SummaryRequestResult> {
  const rejectedIds = new Set(
    rejectedCards.flatMap(({ card }) => {
      if (!card || typeof card !== "object") return [];
      const sourceItemId = (card as { sourceItemId?: unknown }).sourceItemId;
      return typeof sourceItemId === "string" && sourceItemId.trim()
        ? [sourceItemId.trim()]
        : [];
    })
  );
  const matchedItems = (meeting.items || []).filter((item) =>
    rejectedIds.has(item.externalId)
  );
  const sourceContext = matchedItems.length
    ? formatAgendaItemContexts(matchedItems)
    : meeting.llmInputText.slice(0, MAX_AGENDA_ITEM_BATCH_CHARS);
  const relevantIssues = issues.filter((issue) =>
    rejectedCards.some(({ index }) => index === issue.cardIndex)
  );
  const repairPrompt = `Repair only the rejected SimpleCity cards below. Return a complete SimpleCity JSON object containing only the corrected cards; do not repeat accepted cards and do not add new agenda items. Preserve the meeting summary. Correct or remove unsupported values using only the matched agenda-item source. Do not add evidence fields.

Validation issues:
${summarizeValidationIssues(relevantIssues)}

Rejected cards:
${JSON.stringify(rejectedCards.map(({ card }) => card))}

Matched agenda-item source:
${sourceContext}`;

  const { response, text } = await fetchLlmResponse(provider.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      ...(provider.headers || {})
    },
    body: JSON.stringify({
      model: provider.model,
      ...providerSpecificRequestFields(provider),
      messages: [
        { role: "system", content: SIMPLECITY_SYSTEM_PROMPT },
        { role: "user", content: repairPrompt }
      ],
      temperature: 0,
      max_tokens: providerCompletionTokenLimit(
        provider,
        GROQ_REPAIR_MAX_COMPLETION_TOKENS
      ),
      response_format: { type: "json_object" }
    }),
    signal: options.signal
  }, LLM_OPTIONAL_REQUEST_TIMEOUT_MS, {
    label: `${provider.label} targeted repair for ${meeting.title}`,
    provider: provider.name,
    group: options.requestGroup || meeting.id,
    log: options.log
  });

  if (!response.ok) {
    throw new SummaryProviderRequestError(
      provider.name,
      response.status,
      text,
      parseRetryAfterMs(response.headers)
    );
  }

  const raw = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = raw.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider.name} repair response did not include message content.`);

  const validationIssues: SummaryValidationIssue[] = [];
  const summary = attachSourceItemIds(
    meeting,
    parseAndValidateSummary(
      content,
      validationOptionsForMeeting(meeting, (issue) => validationIssues.push(issue))
    )
  );

  return { summary, raw, validationIssues };
}

async function requestTargetedCardRepairsWithFallback(
  meeting: LlmReadyMeeting,
  rejectedCards: Array<{ index: number; card: unknown }>,
  issues: SummaryValidationIssue[],
  options: GenerateSummaryOptions
) {
  const providers = getRotatedSummaryProviders([
    SIMPLECITY_SYSTEM_PROMPT,
    meeting.llmInputText,
    JSON.stringify(rejectedCards),
    JSON.stringify(issues)
  ].join("\n"), GROQ_REPAIR_MAX_COMPLETION_TOKENS);
  let lastError: unknown;

  for (const [index, provider] of providers.entries()) {
    try {
      return await requestTargetedCardRepairs(
        meeting,
        provider,
        rejectedCards,
        issues,
        options
      );
    } catch (error) {
      lastError = error;
      if (
        index < providers.length - 1 &&
        !options.signal?.aborted &&
        !options.shouldStop?.() &&
        canTryNextProvider(error)
      ) continue;
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown card repair error");
}

async function requestSummary(
  meeting: LlmReadyMeeting,
  provider: SummaryProvider,
  options: GenerateSummaryOptions = {},
  regenerationGuidance?: string
): Promise<SummaryRequestResult> {
  const { response, text } = await fetchLlmResponse(provider.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      ...(provider.headers || {})
    },
    body: JSON.stringify({
      model: provider.model,
      ...providerSpecificRequestFields(provider),
      messages: [
        {
          role: "system",
          content: SIMPLECITY_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildSimpleCityUserPrompt(meeting)
        },
        ...(regenerationGuidance
          ? [
              {
                role: "user",
                content: regenerationGuidance
              }
            ]
          : [])
      ],
      temperature: 0,
      max_tokens: providerCompletionTokenLimit(
        provider,
        GROQ_SUMMARY_MAX_COMPLETION_TOKENS
      ),
      response_format: {
        type: "json_object"
      }
    }),
    signal: options.signal
  }, LLM_REQUEST_TIMEOUT_MS, {
    label: `${provider.label} summary for ${meeting.title}`,
    provider: provider.name,
    group: options.requestGroup || meeting.id,
    log: options.log
  });

  if (!response.ok) {
    throw new SummaryProviderRequestError(
      provider.name,
      response.status,
      text,
      parseRetryAfterMs(response.headers)
    );
  }

  const raw = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = raw.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider.name} response did not include message content.`);

  const validationIssues: SummaryValidationIssue[] = [];
  let summary = attachSourceItemIds(
    meeting,
    parseAndValidateSummary(
      content,
      validationOptionsForMeeting(meeting, (issue) => validationIssues.push(issue))
    )
  );

  for (const issue of validationIssues) {
    const disposition = issue.outcome === "warning" ? "warning" : "rejection";
    options.log?.(
      `Summary validation ${disposition} for ${meeting.title}: ${issue.reason}${
        issue.value ? ` (${issue.value})` : ""
      }`
    );
  }

  const rejectedCards = repairableCardsFromResponse(content, validationIssues);
  let repairResult: SummaryRequestResult | null = null;
  if (rejectedCards.length > 0 && !regenerationGuidance) {
    options.log?.(
      `Repairing ${rejectedCards.length} rejected card(s) for ${meeting.title} without regenerating the meeting.`
    );
    try {
      repairResult = await requestTargetedCardRepairsWithFallback(
        meeting,
        rejectedCards,
        validationIssues,
        options
      );
      summary = mergeValidatedSummaries(summary, repairResult.summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown repair error";
      options.log?.(
        `Targeted card repair failed for ${meeting.title}; keeping accepted cards: ${message}`
      );
    }
  }

  return {
    summary,
    raw: {
      ...raw,
      simplecityProvider: {
        name: provider.name,
        model: provider.model
      },
      simplecityValidation: {
        issues: validationIssues,
        regenerated: Boolean(regenerationGuidance),
        targetedRepair: rejectedCards.length > 0,
        repairIssues: repairResult?.validationIssues || []
      }
    },
    validationIssues:
      repairResult && repairResult.summary.cards.length > 0
        ? repairResult.validationIssues
        : validationIssues
  };
}

async function requestTopicValidation(
  candidates: TopicValidationCandidate[],
  provider: SummaryProvider,
  options: GenerateSummaryOptions
) {
  const { response, text } = await fetchLlmResponse(provider.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      ...(provider.headers || {})
    },
    body: JSON.stringify({
      model: provider.model,
      ...providerSpecificRequestFields(provider),
      messages: [
        { role: "system", content: TOPIC_VALIDATION_SYSTEM_PROMPT },
        { role: "user", content: buildTopicValidationPrompt(candidates) }
      ],
      temperature: 0,
      max_tokens: providerCompletionTokenLimit(
        provider,
        GROQ_TOPIC_MAX_COMPLETION_TOKENS
      ),
      response_format: { type: "json_object" }
    }),
    signal: options.signal
  }, LLM_OPTIONAL_REQUEST_TIMEOUT_MS, {
    label: `${provider.label} topic validation for ${candidates.length} card(s)`,
    provider: provider.name,
    group: options.requestGroup,
    log: options.log
  });

  if (!response.ok) {
    throw new SummaryProviderRequestError(
      provider.name,
      response.status,
      text,
      parseRetryAfterMs(response.headers)
    );
  }

  const raw = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = raw.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider.name} topic response did not include message content.`);

  return {
    verified: parseTopicValidation(content, candidates),
    raw: {
      ...raw,
      simplecityProvider: { name: provider.name, model: provider.model }
    }
  };
}

async function requestTopicValidationWithFallback(
  candidates: TopicValidationCandidate[],
  options: GenerateSummaryOptions = {}
) {
  const providers = getRotatedSummaryProviders([
    TOPIC_VALIDATION_SYSTEM_PROMPT,
    buildTopicValidationPrompt(candidates)
  ].join("\n"), GROQ_TOPIC_MAX_COMPLETION_TOKENS);
  let lastError: unknown;

  for (const [index, provider] of providers.entries()) {
    try {
      options.log?.(
        `Verifying ${candidates.length} agenda-card topic and status selection(s) with ${provider.label} (${provider.model}).`
      );
      return await requestTopicValidation(candidates, provider, options);
    } catch (error) {
      lastError = error;
      const hasNextProvider = index < providers.length - 1;
      if (
        hasNextProvider &&
        !options.signal?.aborted &&
        !options.shouldStop?.() &&
        canTryNextProvider(error)
      ) {
        options.log?.(
          `${provider.label} topic/status verification failed; trying ${providers[index + 1].label}.`
        );
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown topic verification error");
}

async function verifySummaryTopics(
  meeting: LlmReadyMeeting,
  result: SummaryRequestResult,
  options: GenerateSummaryOptions
) {
  const candidates = topicValidationCandidates(meeting, result.summary);
  if (candidates.length === 0) return { summary: result.summary, raw: result.raw };

  if (candidates.length < result.summary.cards.length) {
    options.log?.(
      `Topic verification matched ${candidates.length} of ${result.summary.cards.length} cards to isolated agenda-item context.`
    );
  }

  const batches: TopicValidationCandidate[][] = [];
  let currentBatch: TopicValidationCandidate[] = [];
  let currentLength = 0;
  for (const candidate of candidates) {
    const candidateLength = candidate.context.length + 500;
    if (currentBatch.length > 0 && currentLength + candidateLength > MAX_TOPIC_VALIDATION_PROMPT_CHARS) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLength = 0;
    }
    currentBatch.push(candidate);
    currentLength += candidateLength;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  const topicResults = [];
  for (const batch of batches) {
    if (options.signal?.aborted || options.shouldStop?.()) {
      throw summaryStopError(options);
    }
    topicResults.push(await requestTopicValidationWithFallback(batch, options));
  }
  const verified = topicResults.flatMap((topicResult) => topicResult.verified);
  const raw =
    result.raw && typeof result.raw === "object" && !Array.isArray(result.raw)
      ? { ...result.raw, simplecityTopicValidation: topicResults.map((topicResult) => topicResult.raw) }
      : {
          simplecitySummary: result.raw,
          simplecityTopicValidation: topicResults.map((topicResult) => topicResult.raw)
        };

  return {
    summary: applyTopicValidation(result.summary, verified),
    raw
  };
}

async function verifySummaryTopicsSafely(
  meeting: LlmReadyMeeting,
  result: SummaryRequestResult,
  options: GenerateSummaryOptions
) {
  try {
    return await verifySummaryTopics(meeting, result, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown topic verification error";
    options.log?.(
      `Topic/status verification failed for ${meeting.title}; keeping the validated summary: ${message}`
    );
    return { summary: result.summary, raw: result.raw };
  }
}

async function requestSummaryWithFallback(
  meeting: LlmReadyMeeting,
  options: GenerateSummaryOptions = {},
  regenerationGuidance?: string
) {
  const providers = getRotatedSummaryProviders([
    SIMPLECITY_SYSTEM_PROMPT,
    buildSimpleCityUserPrompt(meeting),
    regenerationGuidance || ""
  ].join("\n"), GROQ_SUMMARY_MAX_COMPLETION_TOKENS);
  let lastError: unknown;

  for (const [index, provider] of providers.entries()) {
    try {
      options.log?.(`Requesting LLM summary for ${meeting.title} with ${provider.label} (${provider.model}).`);
      return await requestSummary(meeting, provider, options, regenerationGuidance);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "Unknown LLM error";
      const hasNextProvider = index < providers.length - 1;

      if (
        hasNextProvider &&
        !options.signal?.aborted &&
        !options.shouldStop?.() &&
        canTryNextProvider(error)
      ) {
        options.log?.(
          `${provider.label} failed for ${meeting.title}; trying ${providers[index + 1].label}: ${message}`
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown LLM error");
}

async function generateSummaryForInput(
  meeting: LlmReadyMeeting,
  options: GenerateSummaryOptions = {}
): Promise<{ summary: SimpleCitySummary; raw: unknown }> {
  let lastError: unknown;
  let bestResult: SummaryRequestResult | null = null;
  let regenerationGuidance: string | undefined;
  let usedRegenerationAttempt = false;

  const maxAttempts = getSummaryMaxAttempts();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted || options.shouldStop?.()) {
      lastError = summaryStopError(options);
      break;
    }
    try {
      const result = await requestSummaryWithFallback(meeting, options, regenerationGuidance);
      if (!bestResult || isBetterSummaryResult(result, bestResult)) {
        bestResult = result;
      }

      if (!usedRegenerationAttempt && shouldRegenerateSummary(meeting, result)) {
        usedRegenerationAttempt = true;
        regenerationGuidance = buildRegenerationGuidance(meeting, result);
        options.log?.(
          `Regenerating LLM summary for ${meeting.title}; first response produced ${result.summary.cards.length} cards and ${result.validationIssues.length} validation issues.`
        );
        continue;
      }

      const finalResult = bestResult;
      options.log?.(
        `Finished LLM summary for ${meeting.title}: ${finalResult.summary.cards.length} cards.`
      );
      return await verifySummaryTopicsSafely(meeting, finalResult, options);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "Unknown LLM error";
      if (options.signal?.aborted || options.shouldStop?.()) {
        lastError = summaryStopError(options);
        break;
      }
      if (attempt < maxAttempts && isRetryableSummaryError(error)) {
        const delayMs = retryDelayMs(error, attempt);
        if (options.signal?.aborted || options.shouldStop?.()) {
          lastError = summaryStopError(options);
          break;
        }
        options.log?.(
          `Retrying LLM summary for ${meeting.title} in ${Math.round(delayMs / 1000)}s: ${message}`
        );
        if (options.sleep) await options.sleep(delayMs);
        else await sleep(delayMs, options.signal);
        if (options.signal?.aborted || options.shouldStop?.()) {
          lastError = summaryStopError(options);
          break;
        }
      } else {
        break;
      }
    }
  }

  if (bestResult) {
    options.log?.(
      `Using best validated LLM summary for ${meeting.title} after retry errors: ${bestResult.summary.cards.length} cards.`
    );
    return await verifySummaryTopicsSafely(meeting, bestResult, options);
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown LLM error");
}

function combineBatchSummaries(
  results: Array<{ summary: SimpleCitySummary; raw: unknown }>
): { summary: SimpleCitySummary; raw: unknown } {
  const first = results[0];
  const cards: SimpleCitySummary["cards"] = [];
  const spanishCards: NonNullable<
    NonNullable<SimpleCitySummary["translations"]>["es"]
  >["cards"] = [];

  for (const result of results) {
    const translations = result.summary.translations?.es?.cards || [];
    for (const [index, card] of result.summary.cards.entries()) {
      const duplicate = cards.some(
        (existing) =>
          (existing.sourceItemId && existing.sourceItemId === card.sourceItemId) ||
          (existing.source === card.source &&
            areLikelySameAgendaItem(existing.agendaItem, card.agendaItem))
      );
      if (duplicate) continue;
      cards.push(card);
      spanishCards.push(translations[index] || null);
    }
  }

  const spanishMeeting = results
    .map((result) => result.summary.translations?.es?.meeting)
    .find(Boolean);

  return {
    summary: {
      ...first.summary,
      cards,
      translations:
        results.some((result) => result.summary.translations?.es)
          ? {
              es: {
                ...(spanishMeeting ? { meeting: spanishMeeting } : {}),
                cards: spanishCards
              }
            }
          : undefined
    },
    raw: {
      simplecityItemBatches: results.map((result) => result.raw)
    }
  };
}

export async function runSummaryBatchesSequentially<T>(
  batches: T[],
  generate: (batch: T, index: number) => Promise<{
    summary: SimpleCitySummary;
    raw: unknown;
  }>,
  options: {
    shouldStop?: () => boolean;
    onStopped?: () => void;
    continueOnError?: boolean;
    onError?: (error: unknown, index: number) => void;
  } = {}
) {
  const results: Array<{ summary: SimpleCitySummary; raw: unknown }> = [];
  for (const [index, batch] of batches.entries()) {
    if (options.shouldStop?.()) {
      options.onStopped?.();
      break;
    }
    try {
      results.push(await generate(batch, index));
    } catch (error) {
      if (results.length > 0 && options.shouldStop?.()) {
        options.onStopped?.();
        break;
      }
      if (options.continueOnError) {
        options.onError?.(error, index);
        continue;
      }
      throw error;
    }
  }
  return results;
}

export async function generateSummaryForMeeting(
  meeting: LlmReadyMeeting,
  options: GenerateSummaryOptions = {}
): Promise<{ summary: SimpleCitySummary; raw: unknown }> {
  if (meeting.status === "Cancelled") {
    options.log?.(`Skipping LLM summary for ${meeting.title}; meeting is cancelled.`);
    return {
      summary: {
        meetingSummary: {
          title: meeting.title,
          date: meeting.dateText || "Not listed in the source document.",
          status: "Cancelled",
          oneSentenceSummary: "This meeting was cancelled."
        },
        cards: []
      },
      raw: {
        skipped: true,
        reason: "meeting_cancelled"
      }
    };
  }

  options = {
    ...options,
    requestGroup: options.requestGroup || meeting.id
  };
  options.log?.(`Starting LLM summary for ${meeting.title}.`);
  const batches = buildAgendaItemSummaryBatches(meeting);

  if (batches.length === 1 && batches[0] === meeting) {
    return generateSummaryForInput(meeting, options);
  }

  options.log?.(
    `Summarizing ${meeting.items?.length || 0} structured agenda item(s) in ${batches.length} bounded batch(es).`
  );
  const batchErrors: unknown[] = [];
  const results = await runSummaryBatchesSequentially(
    batches,
    async (batch, index) => {
      options.log?.(
        `Starting agenda-item batch ${index + 1} of ${batches.length} for ${meeting.title}.`
      );
      return generateSummaryForInput(batch, options);
    },
    {
      shouldStop: () => Boolean(options.signal?.aborted || options.shouldStop?.()),
      onStopped: () => options.log?.(
        `Stopped starting agenda-item batches for ${meeting.title} at the pipeline deadline; completed batches will be retained.`
      ),
      continueOnError: true,
      onError: (error, index) => {
        batchErrors.push(error);
        options.log?.(
          `Agenda-item batch ${index + 1} of ${batches.length} failed for ${meeting.title}; continuing with the remaining independent batches: ${
            error instanceof Error ? error.message : "Unknown batch error"
          }`
        );
      }
    }
  );

  if (results.length === 0) {
    if (batchErrors[0] instanceof Error) throw batchErrors[0];
    throw options.signal?.reason instanceof Error
      ? options.signal.reason
      : new Error(`Pipeline deadline reached before an LLM batch completed for ${meeting.title}.`);
  }

  const combined = combineBatchSummaries(results);
  options.log?.(
    `Finished agenda-item batches for ${meeting.title}: ${results.length}/${batches.length} batches succeeded and produced ${combined.summary.cards.length} cards.`
  );
  return combined;
}
