import { AsyncLocalStorage } from "node:async_hooks";

export type LlmProvider = {
  name: "OpenRouter" | "Groq";
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
};

export const LLM_REQUEST_TIMEOUT_MS = 180_000;
export const LLM_OPTIONAL_REQUEST_TIMEOUT_MS = 180_000;
export const LLM_MAX_CONCURRENT_REQUESTS = 2;
export const LLM_MAX_PROCESS_REQUESTS = 40;
export const LLM_MAX_PROCESS_TOKENS = 200_000;
export const LLM_MAX_COMPLETION_TOKENS = 8_000;
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-120b";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const GROQ_MAX_ESTIMATED_INPUT_TOKENS = 6_000;
export const GROQ_MAX_FAILOVER_KEYS_PER_REQUEST = 2;

export class LlmProcessBudgetExceededError extends Error {
  readonly code = "LLM_PROCESS_BUDGET_EXCEEDED";
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "LlmProcessBudgetExceededError";
  }
}

type LlmRequestCategory = "summaries" | "repairs" | "verifications" | "translations" | "results" | "other";
const emptyCategoryCounts = (): Record<LlmRequestCategory, number> => ({
  summaries: 0,
  repairs: 0,
  verifications: 0,
  translations: 0,
  results: 0,
  other: 0
});
type LlmProcessBudgetLimits = {
  requests?: number;
  tokens?: number;
};

type LlmProcessBudgetState = {
  requestLimit: number;
  tokenLimit: number;
  requestCount: number;
  tokenCount: number;
  requestStats: {
    dispatched: number;
    successful: number;
    timedOut: number;
    failed: number;
    aborted: number;
    budgetBlocked: number;
    providers: Record<LlmProvider["name"], number>;
    categories: Record<LlmRequestCategory, number>;
  };
};

function createLlmProcessBudgetState(
  limits?: LlmProcessBudgetLimits
): LlmProcessBudgetState {
  return {
    requestLimit: limits?.requests ?? LLM_MAX_PROCESS_REQUESTS,
    tokenLimit: limits?.tokens ?? LLM_MAX_PROCESS_TOKENS,
    requestCount: 0,
    tokenCount: 0,
    requestStats: {
      dispatched: 0,
      successful: 0,
      timedOut: 0,
      failed: 0,
      aborted: 0,
      budgetBlocked: 0,
      providers: { OpenRouter: 0, Groq: 0 },
      categories: emptyCategoryCounts()
    }
  };
}

const llmProcessBudgetStorage = new AsyncLocalStorage<LlmProcessBudgetState>();
let defaultLlmProcessBudgetState = createLlmProcessBudgetState();

function currentLlmProcessBudgetState() {
  return llmProcessBudgetStorage.getStore() || defaultLlmProcessBudgetState;
}

export function runWithLlmProcessBudget<T>(
  operation: () => T,
  limits?: LlmProcessBudgetLimits
): T {
  if (llmProcessBudgetStorage.getStore()) return operation();
  return llmProcessBudgetStorage.run(createLlmProcessBudgetState(limits), operation);
}

function requestCategory(label?: string): LlmRequestCategory {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("targeted repair")) return "repairs";
  if (normalized.includes("topic validation")) return "verifications";
  if (normalized.includes("translation")) return "translations";
  if (normalized.includes("decision explanation")) return "results";
  if (normalized.includes("summary")) return "summaries";
  return "other";
}

function bodyWithCompletionLimit(init: RequestInit) {
  if (typeof init.body !== "string") return init;
  try {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (body.max_tokens === undefined && body.max_completion_tokens === undefined) {
      body.max_tokens = LLM_MAX_COMPLETION_TOKENS;
      return { ...init, body: JSON.stringify(body) };
    }
  } catch {
    // Non-JSON request bodies pass through unchanged.
  }
  return init;
}

function estimateInputTokens(body: RequestInit["body"]) {
  if (typeof body === "string") return Math.max(1, Math.ceil(body.length / 4));
  return 1;
}

function reserveProcessBudget(
  state: LlmProcessBudgetState,
  estimatedInputTokens: number
) {
  const nextRequestCount = state.requestCount + 1;
  const nextTokenCount = state.tokenCount + estimatedInputTokens;
  if (nextRequestCount > state.requestLimit || nextTokenCount > state.tokenLimit) {
    throw new LlmProcessBudgetExceededError(
      `LLM process budget exhausted before dispatch ` +
      `(requests ${state.requestCount}/${state.requestLimit}, ` +
      `estimated/actual tokens ${state.tokenCount}/${state.tokenLimit}; ` +
      `next request estimated at ${estimatedInputTokens} input tokens).`
    );
  }
  state.requestCount = nextRequestCount;
  state.tokenCount = nextTokenCount;
  return estimatedInputTokens;
}

function reconcileProcessTokenUsage(
  state: LlmProcessBudgetState,
  text: string,
  reservedInputTokens: number
) {
  try {
    const parsed = JSON.parse(text) as {
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
    };
    const total = parsed.usage?.total_tokens;
    if (typeof total === "number" && Number.isFinite(total) && total >= 0) {
      state.tokenCount = Math.max(
        0,
        state.tokenCount - reservedInputTokens + Math.ceil(total)
      );
      return Math.ceil(total);
    }
  } catch {
    // Keep the conservative input estimate when the provider omits usage.
  }
  return null;
}

function providerReportedTokenUsage(text: string) {
  try {
    const parsed = JSON.parse(text) as { usage?: { total_tokens?: unknown } };
    const total = parsed.usage?.total_tokens;
    return typeof total === "number" && Number.isFinite(total) && total >= 0
      ? Math.ceil(total)
      : null;
  } catch {
    return null;
  }
}

export function getLlmProcessBudgetUsage() {
  const state = currentLlmProcessBudgetState();
  return {
    requests: state.requestCount,
    requestLimit: state.requestLimit,
    tokens: state.tokenCount,
    tokenLimit: state.tokenLimit
  };
}

export function getLlmProcessRunSummary() {
  const state = currentLlmProcessBudgetState();
  return {
    ...getLlmProcessBudgetUsage(),
    dispatched: state.requestStats.dispatched,
    successful: state.requestStats.successful,
    timedOut: state.requestStats.timedOut,
    failed: state.requestStats.failed,
    aborted: state.requestStats.aborted,
    budgetBlocked: state.requestStats.budgetBlocked,
    providers: { ...state.requestStats.providers },
    categories: { ...state.requestStats.categories }
  };
}

export function formatLlmProcessRunSummary() {
  const summary = getLlmProcessRunSummary();
  const categories = Object.entries(summary.categories)
    .map(([category, count]) => `${category} ${count}`)
    .join(", ");
  return (
    `LLM run summary: OpenRouter budget requests ${summary.requests}/${summary.requestLimit}; ` +
    `tokens ${summary.tokens}/${summary.tokenLimit}; all-provider attempts ${summary.dispatched} ` +
    `(Groq ${summary.providers.Groq}, OpenRouter ${summary.providers.OpenRouter}); ` +
    `HTTP successful ${summary.successful}; timed out ${summary.timedOut}; ` +
    `failed ${summary.failed}; deadline-aborted ${summary.aborted}; ` +
    `budget-blocked ${summary.budgetBlocked}; by type: ${categories}.`
  );
}

export function resetLlmProcessBudgetForTests(limits?: LlmProcessBudgetLimits) {
  const resetState = createLlmProcessBudgetState(limits);
  const currentState = llmProcessBudgetStorage.getStore();
  if (currentState) {
    Object.assign(currentState, resetState);
    return;
  }
  defaultLlmProcessBudgetState = resetState;
}

let activeLlmRequests = 0;
const pendingLlmRequests: Array<{
  group: string;
  start: () => void;
  cancel: (reason: unknown) => void;
}> = [];
let lastStartedLlmGroup: string | null = null;

async function acquireLlmRequestSlot(
  group: string,
  signal?: AbortSignal | null
) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  }
  if (activeLlmRequests < LLM_MAX_CONCURRENT_REQUESTS) {
    activeLlmRequests += 1;
    lastStartedLlmGroup = group;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => pending.cancel(
      signal?.reason ?? new DOMException("The operation was aborted.", "AbortError")
    );
    const pending = {
      group,
      start: () => {
        if (settled) return;
        settled = true;
        cleanup();
        activeLlmRequests += 1;
        lastStartedLlmGroup = group;
        resolve();
      },
      cancel: (reason: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        const index = pendingLlmRequests.indexOf(pending);
        if (index >= 0) pendingLlmRequests.splice(index, 1);
        reject(reason);
      }
    };
    pendingLlmRequests.push(pending);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function releaseLlmRequestSlot() {
  activeLlmRequests = Math.max(0, activeLlmRequests - 1);
  while (pendingLlmRequests.length > 0) {
    const differentGroupIndex = pendingLlmRequests.findIndex(
      (pending) => pending.group !== lastStartedLlmGroup
    );
    const nextIndex = differentGroupIndex >= 0
      ? differentGroupIndex
      : 0;
    const [pending] = pendingLlmRequests.splice(nextIndex, 1);
    if (!pending) continue;
    pending.start();
    break;
  }
}

type LlmRequestTelemetry = {
  label: string;
  provider?: LlmProvider["name"];
  group?: string;
  log?: (message: string) => void;
};

function formatRequestDuration(elapsedMs: number) {
  return elapsedMs < 1000
    ? `${elapsedMs}ms`
    : `${(elapsedMs / 1000).toFixed(1)}s`;
}

function responseProviderLabel(text: string) {
  try {
    const parsed = JSON.parse(text) as { provider?: unknown };
    return typeof parsed.provider === "string" && parsed.provider.trim()
      ? parsed.provider.trim()
      : null;
  } catch {
    return null;
  }
}

export async function fetchLlmResponse(
  url: string,
  init: RequestInit,
  timeoutMs = LLM_REQUEST_TIMEOUT_MS,
  telemetry?: LlmRequestTelemetry
): Promise<{ response: Response; text: string }> {
  const budgetState = currentLlmProcessBudgetState();
  const queuedAt = Date.now();
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let acquiredSlot = false;
  let reservedInputTokens = 0;
  let requestDispatched = false;
  let timedOut = false;
  const timeoutLabel = timeoutMs >= 1000
    ? `${Math.round(timeoutMs / 1000)} seconds`
    : `${timeoutMs} milliseconds`;
  const timeoutError = new Error(`LLM request timed out after ${timeoutLabel}.`);
  timeoutError.name = "AbortError";

  try {
    await acquireLlmRequestSlot(
      telemetry?.group || telemetry?.label || "llm",
      upstreamSignal
    );
    acquiredSlot = true;
    const queuedMs = Date.now() - queuedAt;
    if (queuedMs >= 1000) {
      telemetry?.log?.(
        `${telemetry.label} waited ${formatRequestDuration(queuedMs)} for an LLM request slot.`
      );
    }
    if (upstreamSignal?.aborted) {
      throw upstreamSignal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    }
    upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
    const boundedInit = bodyWithCompletionLimit(init);
    const providerName = telemetry?.provider ||
      (url.includes("openrouter.ai") ? "OpenRouter" : "Groq");
    const consumesBudget = providerName === "OpenRouter";
    if (consumesBudget) {
      reservedInputTokens = reserveProcessBudget(
        budgetState,
        estimateInputTokens(boundedInit.body)
      );
    }
    requestDispatched = true;
    budgetState.requestStats.dispatched += 1;
    budgetState.requestStats.providers[providerName] += 1;
    budgetState.requestStats.categories[requestCategory(telemetry?.label)] += 1;
    const usage = {
      requests: budgetState.requestCount,
      requestLimit: budgetState.requestLimit,
      tokens: budgetState.tokenCount,
      tokenLimit: budgetState.tokenLimit
    };
    telemetry?.log?.(consumesBudget
      ? `${telemetry.label} OpenRouter budget: request ${usage.requests}/${usage.requestLimit}, ` +
        `estimated/actual tokens ${usage.tokens}/${usage.tokenLimit}.`
      : `${telemetry.label} uses Groq and does not consume the OpenRouter budget ` +
        `(currently ${usage.requests}/${usage.requestLimit} requests, ` +
        `${usage.tokens}/${usage.tokenLimit} tokens).`);
    const request = (async () => {
      const response = await fetch(url, {
        ...boundedInit,
        signal: controller.signal
      });
      const text = await response.text();
      return { response, text };
    })();
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(timeoutError);
      }, timeoutMs);
    });
    const result = await Promise.race([request, deadline]);
    if (result.response.ok) budgetState.requestStats.successful += 1;
    else budgetState.requestStats.failed += 1;
    const actualTokens = consumesBudget
      ? reconcileProcessTokenUsage(budgetState, result.text, reservedInputTokens)
      : providerReportedTokenUsage(result.text);
    if (actualTokens !== null) {
      const reconciledUsage = {
        tokens: budgetState.tokenCount,
        tokenLimit: budgetState.tokenLimit
      };
      telemetry?.log?.(consumesBudget
        ? `${telemetry.label} used ${actualTokens} provider-reported tokens; ` +
          `OpenRouter budget total ${reconciledUsage.tokens}/${reconciledUsage.tokenLimit}.`
        : `${telemetry.label} used ${actualTokens} provider-reported Groq tokens; ` +
          `OpenRouter budget remains ${reconciledUsage.tokens}/${reconciledUsage.tokenLimit}.`);
    }
    const responseProvider = responseProviderLabel(result.text);
    telemetry?.log?.(
      `${telemetry.label} completed in ${formatRequestDuration(Date.now() - queuedAt)} (HTTP ${result.response.status}${responseProvider ? `, provider ${responseProvider}` : ""}).`
    );
    return result;
  } catch (error) {
    if (error instanceof LlmProcessBudgetExceededError) {
      budgetState.requestStats.budgetBlocked += 1;
    } else if (requestDispatched && timedOut) {
      budgetState.requestStats.timedOut += 1;
    } else if (requestDispatched && upstreamSignal?.aborted) {
      budgetState.requestStats.aborted += 1;
    } else if (requestDispatched) {
      budgetState.requestStats.failed += 1;
    }
    const message = error instanceof Error ? error.message : "Unknown request error";
    telemetry?.log?.(
      `${telemetry.label} failed after ${formatRequestDuration(Date.now() - queuedAt)}: ${message}`
    );
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    if (acquiredSlot) releaseLlmRequestSlot();
  }
}

function getConfiguredOpenRouterProviders(): LlmProvider[] {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  return [
    {
      name: "OpenRouter",
      label: "OpenRouter",
      apiKey,
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
      headers: {
        "HTTP-Referer": "https://simplecity.app",
        "X-Title": "SimpleCity"
      }
    }
  ];
}

let groqRotationSignature = "";
let nextGroqProviderIndex = 0;

export function getConfiguredGroqProviders(): LlmProvider[] {
  const apiKeys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);

  return apiKeys.map((apiKey, index) => ({
    name: "Groq",
    label: apiKeys.length > 1 ? `Groq key ${index + 1}` : "Groq",
    apiKey,
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    model: process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL
  }));
}

function getRotatedGroqProviders() {
  const providers = getConfiguredGroqProviders();
  if (providers.length === 0) return providers;

  const signature = providers.map((provider) => provider.apiKey).join("\u0000");
  if (signature !== groqRotationSignature) {
    groqRotationSignature = signature;
    nextGroqProviderIndex = 0;
  }

  const startIndex = nextGroqProviderIndex % providers.length;
  nextGroqProviderIndex = (startIndex + 1) % providers.length;
  return [...providers.slice(startIndex), ...providers.slice(0, startIndex)];
}

export function estimateLlmInputTokens(input: unknown) {
  const text = typeof input === "string" ? input : JSON.stringify(input);
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Short prompts use one rotating Groq key with one bounded Groq failover, then
 * OpenRouter. Large prompts stay on OpenRouter. Across logical requests the
 * rotation advances through every configured Groq key without fanning one
 * failure out across all five accounts.
 */
export function getLlmProvidersForInput(input: unknown): LlmProvider[] {
  const openRouter = getConfiguredOpenRouterProviders();
  const configuredGroq = getConfiguredGroqProviders();
  const shortRequest = estimateLlmInputTokens(input) <= GROQ_MAX_ESTIMATED_INPUT_TOKENS;

  if (shortRequest && configuredGroq.length > 0) {
    const groq = getRotatedGroqProviders();
    return [
      ...groq.slice(0, GROQ_MAX_FAILOVER_KEYS_PER_REQUEST),
      ...openRouter
    ];
  }

  if (openRouter.length > 0) return openRouter;
  return getRotatedGroqProviders().slice(0, GROQ_MAX_FAILOVER_KEYS_PER_REQUEST);
}

export function getConfiguredLlmProviders(): LlmProvider[] {
  return [...getConfiguredGroqProviders(), ...getConfiguredOpenRouterProviders()];
}

export function providerSpecificRequestFields(provider: LlmProvider) {
  return provider.name === "OpenRouter"
    ? { provider: { require_parameters: true } }
    : {};
}

export function hasConfiguredLlmProvider() {
  return getConfiguredLlmProviders().length > 0;
}
