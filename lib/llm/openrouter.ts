import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { buildSimpleCityUserPrompt, SIMPLECITY_SYSTEM_PROMPT } from "./prompts";
import {
  parseAndValidateSummary,
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
};

type SummaryRequestResult = {
  summary: SimpleCitySummary;
  raw: unknown;
  validationIssues: SummaryValidationIssue[];
};

type SummaryProvider = {
  name: "OpenRouter" | "Cerebras";
  apiKey: string;
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
  minIntervalEnv: string;
};

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

const lastSummaryRequestAtByProvider = new Map<SummaryProvider["name"], number>();
const MAX_TOPIC_VALIDATION_PROMPT_CHARS = 60_000;

function hasUsableSourceText(meeting: LlmReadyMeeting) {
  const input = meeting.llmInputText.trim();
  return meeting.status === "Cancelled" ? input.length > 0 : input.length >= 300;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNonNegativeEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getSummaryMaxAttempts() {
  const raw = process.env.LLM_SUMMARY_MAX_ATTEMPTS || process.env.OPENROUTER_SUMMARY_MAX_ATTEMPTS;
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

function getConfiguredSummaryProviders() {
  const providers: SummaryProvider[] = [];
  const referer = getConfiguredAppUrl();

  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      name: "OpenRouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free",
      headers: {
        "HTTP-Referer": referer,
        "X-OpenRouter-Title": "SimpleCity"
      },
      minIntervalEnv: "OPENROUTER_MIN_REQUEST_INTERVAL_MS"
    });
  }

  if (process.env.CEREBRAS_API_KEY) {
    providers.push({
      name: "Cerebras",
      apiKey: process.env.CEREBRAS_API_KEY,
      baseUrl: "https://api.cerebras.ai/v1/chat/completions",
      model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
      minIntervalEnv: "CEREBRAS_MIN_REQUEST_INTERVAL_MS"
    });
  }

  if (providers.length === 0) {
    throw new Error("Missing LLM provider API key. Configure OPENROUTER_API_KEY or CEREBRAS_API_KEY.");
  }

  return providers;
}

export function hasSummaryProviderConfig() {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.CEREBRAS_API_KEY);
}

async function waitForProviderSlot(provider: SummaryProvider, options: GenerateSummaryOptions) {
  const fallbackMs = provider.name === "OpenRouter" ? 10_000 : 5_000;
  const minIntervalMs = parseNonNegativeEnv(provider.minIntervalEnv, fallbackMs);
  if (minIntervalMs <= 0) return;

  const lastRequestAt = lastSummaryRequestAtByProvider.get(provider.name) || 0;
  const waitMs = lastRequestAt + minIntervalMs - Date.now();
  if (waitMs > 0) {
    options.log?.(
      `Waiting ${Math.ceil(waitMs / 1000)}s before the next ${provider.name} summary request.`
    );
    await (options.sleep || sleep)(waitMs);
  }

  lastSummaryRequestAtByProvider.set(provider.name, Date.now());
}

function isRetryableSummaryError(error: unknown) {
  if (error instanceof SummaryProviderRequestError) return error.retryable;
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
      ? "OPENROUTER_RATE_LIMIT_RETRY_BASE_MS"
      : "OPENROUTER_SUMMARY_RETRY_BASE_MS",
    isLlmRateLimitError(error) ? 30_000 : 5_000
  );

  return baseMs * attempt;
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

function shouldRegenerateSummary(meeting: LlmReadyMeeting, result: SummaryRequestResult) {
  if (result.validationIssues.length > 0) return true;
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

  return candidate.validationIssues.length < current.validationIssues.length;
}

async function requestSummary(
  meeting: LlmReadyMeeting,
  provider: SummaryProvider,
  options: GenerateSummaryOptions = {},
  regenerationGuidance?: string
): Promise<SummaryRequestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  await waitForProviderSlot(provider, options);

  const response = await fetch(provider.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      ...(provider.headers || {})
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: provider.model,
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
      response_format: {
        type: "json_object"
      }
    })
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const text = await response.text();
    throw new SummaryProviderRequestError(
      provider.name,
      response.status,
      text,
      parseRetryAfterMs(response.headers)
    );
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = raw.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider.name} response did not include message content.`);

  const validationIssues: SummaryValidationIssue[] = [];
  const summary = parseAndValidateSummary(
    content,
    validationOptionsForMeeting(meeting, (issue) => validationIssues.push(issue))
  );

  for (const issue of validationIssues) {
    options.log?.(
      `Summary validation issue for ${meeting.title}: ${issue.reason}${
        issue.value ? ` (${issue.value})` : ""
      }`
    );
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
        regenerated: Boolean(regenerationGuidance)
      }
    },
    validationIssues
  };
}

async function requestTopicValidation(
  candidates: TopicValidationCandidate[],
  provider: SummaryProvider,
  options: GenerateSummaryOptions = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  await waitForProviderSlot(provider, options);

  const response = await fetch(provider.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      ...(provider.headers || {})
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: TOPIC_VALIDATION_SYSTEM_PROMPT },
        { role: "user", content: buildTopicValidationPrompt(candidates) }
      ],
      temperature: 0,
      response_format: { type: "json_object" }
    })
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const text = await response.text();
    throw new SummaryProviderRequestError(
      provider.name,
      response.status,
      text,
      parseRetryAfterMs(response.headers)
    );
  }

  const raw = (await response.json()) as {
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
  const providers = getConfiguredSummaryProviders();
  let lastError: unknown;

  for (const [index, provider] of providers.entries()) {
    try {
      options.log?.(
        `Verifying ${candidates.length} agenda-card topic and status selection(s) with ${provider.name} (${provider.model}).`
      );
      return await requestTopicValidation(candidates, provider, options);
    } catch (error) {
      lastError = error;
      const hasNextProvider = index < providers.length - 1;
      if (hasNextProvider && isRetryableSummaryError(error)) {
        options.log?.(`${provider.name} topic/status verification failed; trying ${providers[index + 1].name}.`);
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

async function requestSummaryWithFallback(
  meeting: LlmReadyMeeting,
  options: GenerateSummaryOptions = {},
  regenerationGuidance?: string
) {
  const providers = getConfiguredSummaryProviders();
  let lastError: unknown;

  for (const [index, provider] of providers.entries()) {
    try {
      options.log?.(`Requesting LLM summary for ${meeting.title} with ${provider.name} (${provider.model}).`);
      return await requestSummary(meeting, provider, options, regenerationGuidance);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "Unknown LLM error";
      const hasNextProvider = index < providers.length - 1;

      if (hasNextProvider && isRetryableSummaryError(error)) {
        options.log?.(
          `${provider.name} failed for ${meeting.title}; trying ${providers[index + 1].name}: ${message}`
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown LLM error");
}

export async function generateSummaryForMeeting(
  meeting: LlmReadyMeeting,
  options: GenerateSummaryOptions = {}
): Promise<{ summary: SimpleCitySummary; raw: unknown }> {
  options.log?.(`Starting LLM summary for ${meeting.title}.`);

  let lastError: unknown;
  let bestResult: SummaryRequestResult | null = null;
  let regenerationGuidance: string | undefined;
  let usedRegenerationAttempt = false;

  const maxAttempts = getSummaryMaxAttempts();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
      return await verifySummaryTopics(meeting, finalResult, options);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "Unknown LLM error";
      if (attempt < maxAttempts && isRetryableSummaryError(error)) {
        const delayMs = retryDelayMs(error, attempt);
        options.log?.(
          `Retrying LLM summary for ${meeting.title} in ${Math.round(delayMs / 1000)}s: ${message}`
        );
        await (options.sleep || sleep)(delayMs);
      } else {
        break;
      }
    }
  }

  if (bestResult) {
    options.log?.(
      `Using best validated LLM summary for ${meeting.title} after retry errors: ${bestResult.summary.cards.length} cards.`
    );
    return await verifySummaryTopics(meeting, bestResult, options);
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown LLM error");
}
