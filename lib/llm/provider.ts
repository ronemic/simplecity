export type LlmProvider = {
  name: "OpenRouter";
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
};

export const LLM_REQUEST_TIMEOUT_MS = 300_000;
export const LLM_OPTIONAL_REQUEST_TIMEOUT_MS = 120_000;
export const LLM_MAX_CONCURRENT_REQUESTS = 2;
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-120b";

let activeLlmRequests = 0;
const pendingLlmRequests: Array<{
  cancelled: boolean;
  group: string;
  start: () => void;
}> = [];
let lastStartedLlmGroup: string | null = null;

async function acquireLlmRequestSlot(
  timeoutMs: number,
  timeoutError: Error,
  group: string
) {
  if (activeLlmRequests < LLM_MAX_CONCURRENT_REQUESTS) {
    activeLlmRequests += 1;
    lastStartedLlmGroup = group;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const pending = {
      cancelled: false,
      group,
      start: () => {
        clearTimeout(timer);
        activeLlmRequests += 1;
        lastStartedLlmGroup = group;
        resolve();
      }
    };
    pendingLlmRequests.push(pending);
    const timer = setTimeout(() => {
      pending.cancelled = true;
      reject(timeoutError);
    }, timeoutMs);
  });
}

function releaseLlmRequestSlot() {
  activeLlmRequests = Math.max(0, activeLlmRequests - 1);
  while (pendingLlmRequests.some((pending) => !pending.cancelled)) {
    const differentGroupIndex = pendingLlmRequests.findIndex(
      (pending) => !pending.cancelled && pending.group !== lastStartedLlmGroup
    );
    const nextIndex = differentGroupIndex >= 0
      ? differentGroupIndex
      : pendingLlmRequests.findIndex((pending) => !pending.cancelled);
    const [pending] = pendingLlmRequests.splice(nextIndex, 1);
    if (!pending || pending.cancelled) continue;
    pending.start();
    break;
  }
  while (pendingLlmRequests[0]?.cancelled) pendingLlmRequests.shift();
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
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let acquiredSlot = false;
  const timeoutLabel = timeoutMs >= 1000
    ? `${Math.round(timeoutMs / 1000)} seconds`
    : `${timeoutMs} milliseconds`;
  const timeoutError = new Error(`LLM request timed out after ${timeoutLabel}.`);
  timeoutError.name = "AbortError";

  try {
    await acquireLlmRequestSlot(
      timeoutMs,
      timeoutError,
      telemetry?.group || telemetry?.label || "llm"
    );
    acquiredSlot = true;
    const queuedMs = Date.now() - queuedAt;
    if (queuedMs >= 1000) {
      telemetry?.log?.(
        `${telemetry.label} waited ${formatRequestDuration(queuedMs)} for an LLM request slot.`
      );
    }
    const remainingMs = Math.max(1, timeoutMs - queuedMs);
    const request = (async () => {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });
      const text = await response.text();
      return { response, text };
    })();
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(timeoutError);
      }, remainingMs);
    });
    const result = await Promise.race([request, deadline]);
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
