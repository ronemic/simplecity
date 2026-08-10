export type LlmProvider = {
  name: "OpenRouter";
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
};

export const LLM_REQUEST_TIMEOUT_MS = 300_000;
export const LLM_OPTIONAL_REQUEST_TIMEOUT_MS = 180_000;
export const LLM_MAX_CONCURRENT_REQUESTS = 2;
export const LLM_MAX_PROCESS_REQUESTS = 40;
export const LLM_MAX_PROCESS_TOKENS = 200_000;
export const LLM_MAX_COMPLETION_TOKENS = 8_000;
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-120b";

export class LlmProcessBudgetExceededError extends Error {
  readonly code = "LLM_PROCESS_BUDGET_EXCEEDED";
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "LlmProcessBudgetExceededError";
  }
}

let processRequestLimit = LLM_MAX_PROCESS_REQUESTS;
let processTokenLimit = LLM_MAX_PROCESS_TOKENS;
let processRequestCount = 0;
let processTokenCount = 0;

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

function reserveProcessBudget(estimatedInputTokens: number) {
  const nextRequestCount = processRequestCount + 1;
  const nextTokenCount = processTokenCount + estimatedInputTokens;
  if (nextRequestCount > processRequestLimit || nextTokenCount > processTokenLimit) {
    throw new LlmProcessBudgetExceededError(
      `LLM process budget exhausted before dispatch ` +
      `(requests ${processRequestCount}/${processRequestLimit}, ` +
      `estimated/actual tokens ${processTokenCount}/${processTokenLimit}; ` +
      `next request estimated at ${estimatedInputTokens} input tokens).`
    );
  }
  processRequestCount = nextRequestCount;
  processTokenCount = nextTokenCount;
  return estimatedInputTokens;
}

function reconcileProcessTokenUsage(text: string, reservedInputTokens: number) {
  try {
    const parsed = JSON.parse(text) as {
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
    };
    const total = parsed.usage?.total_tokens;
    if (typeof total === "number" && Number.isFinite(total) && total >= 0) {
      processTokenCount = Math.max(0, processTokenCount - reservedInputTokens + Math.ceil(total));
      return Math.ceil(total);
    }
  } catch {
    // Keep the conservative input estimate when the provider omits usage.
  }
  return null;
}

export function getLlmProcessBudgetUsage() {
  return {
    requests: processRequestCount,
    requestLimit: processRequestLimit,
    tokens: processTokenCount,
    tokenLimit: processTokenLimit
  };
}

export function resetLlmProcessBudgetForTests(limits?: {
  requests?: number;
  tokens?: number;
}) {
  processRequestCount = 0;
  processTokenCount = 0;
  processRequestLimit = limits?.requests ?? LLM_MAX_PROCESS_REQUESTS;
  processTokenLimit = limits?.tokens ?? LLM_MAX_PROCESS_TOKENS;
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
  const queuedAt = Date.now();
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let acquiredSlot = false;
  let reservedInputTokens = 0;
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
    reservedInputTokens = reserveProcessBudget(estimateInputTokens(boundedInit.body));
    const usage = getLlmProcessBudgetUsage();
    telemetry?.log?.(
      `${telemetry.label} LLM process budget: request ${usage.requests}/${usage.requestLimit}, ` +
      `estimated/actual tokens ${usage.tokens}/${usage.tokenLimit}.`
    );
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
        controller.abort();
        reject(timeoutError);
      }, timeoutMs);
    });
    const result = await Promise.race([request, deadline]);
    const actualTokens = reconcileProcessTokenUsage(result.text, reservedInputTokens);
    if (actualTokens !== null) {
      const reconciledUsage = getLlmProcessBudgetUsage();
      telemetry?.log?.(
        `${telemetry.label} used ${actualTokens} provider-reported tokens; ` +
        `process total ${reconciledUsage.tokens}/${reconciledUsage.tokenLimit}.`
      );
    }
    const responseProvider = responseProviderLabel(result.text);
    telemetry?.log?.(
      `${telemetry.label} completed in ${formatRequestDuration(Date.now() - queuedAt)} (HTTP ${result.response.status}${responseProvider ? `, provider ${responseProvider}` : ""}).`
    );
    return result;
  } catch (error) {
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

export function getConfiguredLlmProviders(): LlmProvider[] {
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

export function hasConfiguredLlmProvider() {
  return getConfiguredLlmProviders().length > 0;
}
