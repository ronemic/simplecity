type CapacityState = {
  nextRequestAt: number;
  blockedUntil: number;
  remainingTokens: number | null;
  tokenResetAt: number;
};

const capacityByProvider = new Map<string, CapacityState>();

export function positiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function nonNegativeNumberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function estimateLlmTokens(prompt: string, maxCompletionTokens: number) {
  return Math.ceil(prompt.length / 4) + maxCompletionTokens;
}

export function parseRetryAfterMs(headers: Headers, now = Date.now()) {
  const raw = headers.get("retry-after");
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const retryAt = Date.parse(raw);
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - now);
}

function parseResetMs(value: string | null, now: number) {
  if (!value) return null;
  const trimmed = value.trim();
  const compound = trimmed.match(/^(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (compound && (compound[1] || compound[2])) {
    return Number(compound[1] || 0) * 60_000 + Number(compound[2] || 0) * 1000;
  }
  const duration = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/i);
  if (duration) {
    const amount = Number(duration[1]);
    const unit = (duration[2] || "s").toLowerCase();
    return amount * (unit === "ms" ? 1 : unit === "m" ? 60_000 : 1000);
  }
  const timestamp = Date.parse(trimmed);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - now);
}

export function observeLlmRateLimitHeaders(
  capacityKey: string,
  headers: Headers,
  now = Date.now()
) {
  const state = capacityByProvider.get(capacityKey) || {
    nextRequestAt: 0,
    blockedUntil: 0,
    remainingTokens: null,
    tokenResetAt: 0
  };
  const remainingHeader =
    headers.get("x-ratelimit-remaining-tokens-minute") ||
    headers.get("x-ratelimit-remaining-tokens");
  const remaining = remainingHeader === null ? Number.NaN : Number(remainingHeader);
  if (Number.isFinite(remaining)) {
    state.remainingTokens = remaining;
    const resetMs = parseResetMs(
      headers.get("x-ratelimit-reset-tokens-minute") ||
        headers.get("x-ratelimit-reset-tokens"),
      now
    );
    if (resetMs !== null) state.tokenResetAt = now + resetMs;
    if (remaining <= 0 && resetMs !== null) {
      state.blockedUntil = Math.max(state.blockedUntil, now + resetMs);
    }
  }
  capacityByProvider.set(capacityKey, state);
}

export async function waitForLlmCapacity(options: {
  capacityKey: string;
  label: string;
  prompt: string;
  maxCompletionTokens: number;
  minIntervalMs: number;
  tokensPerMinute: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}) {
  const now = Date.now();
  const state = capacityByProvider.get(options.capacityKey) || {
    nextRequestAt: 0,
    blockedUntil: 0,
    remainingTokens: null,
    tokenResetAt: 0
  };
  const requestTokens = estimateLlmTokens(options.prompt, options.maxCompletionTokens);
  const headerResetAt =
    state.remainingTokens !== null &&
    state.remainingTokens < requestTokens &&
    state.tokenResetAt > now
      ? state.tokenResetAt
      : 0;
  const waitUntil = Math.max(state.nextRequestAt, state.blockedUntil, headerResetAt);
  const waitMs = Math.max(0, waitUntil - now);
  if (waitMs > 0) {
    options.log?.(`Waiting ${Math.ceil(waitMs / 1000)}s for ${options.label} request capacity.`);
    await (options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(waitMs);
  }

  const tokenSpacingMs = options.tokensPerMinute > 0
    ? Math.ceil((requestTokens / options.tokensPerMinute) * 60_000)
    : 0;
  state.nextRequestAt = Date.now() + Math.max(options.minIntervalMs, tokenSpacingMs);
  state.blockedUntil = Math.max(state.blockedUntil, Date.now());
  if (headerResetAt > 0) {
    state.remainingTokens = null;
    state.tokenResetAt = 0;
  } else if (state.remainingTokens !== null) {
    state.remainingTokens = Math.max(0, state.remainingTokens - requestTokens);
  }
  capacityByProvider.set(options.capacityKey, state);
}

export function jitteredBackoffMs(baseMs: number, attempt: number, random = Math.random) {
  const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
  return Math.round(exponential * (0.8 + Math.max(0, Math.min(1, random())) * 0.4));
}

export function resetLlmCapacityForTests() {
  capacityByProvider.clear();
}
