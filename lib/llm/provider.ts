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
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-120b";

type LlmRequestTelemetry = {
  label: string;
  log?: (message: string) => void;
};

function formatRequestDuration(elapsedMs: number) {
  return elapsedMs < 1000
    ? `${elapsedMs}ms`
    : `${(elapsedMs / 1000).toFixed(1)}s`;
}

export async function fetchLlmResponse(
  url: string,
  init: RequestInit,
  timeoutMs = LLM_REQUEST_TIMEOUT_MS,
  telemetry?: LlmRequestTelemetry
): Promise<{ response: Response; text: string }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutLabel = timeoutMs >= 1000
    ? `${Math.round(timeoutMs / 1000)} seconds`
    : `${timeoutMs} milliseconds`;
  const timeoutError = new Error(`LLM request timed out after ${timeoutLabel}.`);
  timeoutError.name = "AbortError";

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
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([request, deadline]);
    telemetry?.log?.(
      `${telemetry.label} completed in ${formatRequestDuration(Date.now() - startedAt)} (HTTP ${result.response.status}).`
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown request error";
    telemetry?.log?.(
      `${telemetry.label} failed after ${formatRequestDuration(Date.now() - startedAt)}: ${message}`
    );
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
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
