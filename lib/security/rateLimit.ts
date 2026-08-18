import { createHmac } from "node:crypto";
import { getDefaultJurisdiction, getServiceSupabaseClientForJurisdiction } from "@/lib/config/jurisdictions";

type RateLimitOptions = {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
};

type LocalRateLimitEntry = {
  windowStartedAt: number;
  requestCount: number;
  blockedUntil: number;
  updatedAt: number;
  /**
   * The point after which this entry can no longer affect a decision: its
   * window has rolled over and any block has lifted. Reaching it means the next
   * lookup would start a fresh window anyway, so dropping the entry early is
   * indistinguishable from keeping it.
   */
  expiresAt: number;
};

const globalForRateLimits = globalThis as typeof globalThis & {
  simpleCityLocalRateLimits?: Map<string, LocalRateLimitEntry>;
  simpleCityRateLimitFallbackWarned?: boolean;
  simpleCityDatabaseRateLimitsUnavailable?: boolean;
  simpleCityLocalRateLimitSweepAt?: number;
};

const localRateLimits = globalForRateLimits.simpleCityLocalRateLimits ?? new Map<string, LocalRateLimitEntry>();
globalForRateLimits.simpleCityLocalRateLimits = localRateLimits;

/**
 * The fallback store is only reachable when the Supabase rate-limit migration
 * is missing, and that fallback latches for the life of the process. Without a
 * sweep every distinct scope/identifier pair -- which includes per-IP and
 * per-card keys -- would be retained forever and grow until the process runs
 * out of memory.
 */
const LOCAL_RATE_LIMIT_MAX_ENTRIES = 20_000;
/**
 * Sweeping down to a target below the cap, rather than to the cap exactly,
 * keeps the cost amortized: one pass buys room for many inserts instead of
 * running a full scan on every request once the store is full.
 */
const LOCAL_RATE_LIMIT_TARGET_ENTRIES = 18_000;
const LOCAL_RATE_LIMIT_SWEEP_INTERVAL_MS = 60_000;

function localRateLimitExpiry(
  windowStartedAt: number,
  windowSeconds: number,
  blockedUntil: number
) {
  return Math.max(windowStartedAt + windowSeconds * 1000, blockedUntil);
}

function sweepLocalRateLimits(now: number) {
  for (const [key, entry] of localRateLimits) {
    if (entry.expiresAt <= now) localRateLimits.delete(key);
  }

  if (localRateLimits.size <= LOCAL_RATE_LIMIT_MAX_ENTRIES) return;

  // Everything still here is live, so the store is under pressure from many
  // distinct identifiers at once. Shed in insertion order, which is also window
  // order: an entry's window is fixed at creation, so the oldest entries are
  // the ones closest to expiring anyway.
  //
  // Trade-off worth knowing: shedding a live entry forgives the requests it had
  // counted, so an attacker able to mint enough distinct identifiers can flush
  // the store and reset their own counter. Bounded memory is the priority on a
  // path that only runs when the database limiter is missing, and the database
  // limiter has no such ceiling.
  let excess = localRateLimits.size - LOCAL_RATE_LIMIT_TARGET_ENTRIES;
  for (const key of localRateLimits.keys()) {
    if (excess <= 0) break;
    localRateLimits.delete(key);
    excess -= 1;
  }
}

function maybeSweepLocalRateLimits(now: number) {
  const dueAt = globalForRateLimits.simpleCityLocalRateLimitSweepAt ?? 0;
  if (localRateLimits.size <= LOCAL_RATE_LIMIT_MAX_ENTRIES && now < dueAt) return;

  sweepLocalRateLimits(now);
  globalForRateLimits.simpleCityLocalRateLimitSweepAt = now + LOCAL_RATE_LIMIT_SWEEP_INTERVAL_MS;
}

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function rateLimitSecret() {
  const secret = process.env.RATE_LIMIT_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (!secret) throw new Error("Missing RATE_LIMIT_SECRET or ADMIN_PASSWORD.");
  return secret;
}

export function getRequestIp(request: Request) {
  const value =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return value.split(",")[0]?.trim() || "unknown";
}

export function createRateLimitKey(scope: string, identifier: string) {
  return createHmac("sha256", rateLimitSecret())
    .update(`${scope}:${identifier.trim().toLowerCase()}`)
    .digest("hex");
}

function rateLimitSupabase() {
  return getServiceSupabaseClientForJurisdiction(getDefaultJurisdiction().slug);
}

function isMissingRateLimitFunction(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST202" ||
    String(error.message || "").includes("Could not find the function public.consume_security_rate_limit")
  );
}

export function consumeLocalRateLimit(
  keyHash: string,
  options: Pick<RateLimitOptions, "limit" | "windowSeconds" | "blockSeconds">,
  now = Date.now()
): RateLimitResult {
  maybeSweepLocalRateLimits(now);

  const current = localRateLimits.get(keyHash);
  if (current?.blockedUntil && current.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000))
    };
  }

  const windowMs = options.windowSeconds * 1000;
  if (!current || current.windowStartedAt + windowMs <= now) {
    localRateLimits.set(keyHash, {
      windowStartedAt: now,
      requestCount: 1,
      blockedUntil: 0,
      updatedAt: now,
      expiresAt: localRateLimitExpiry(now, options.windowSeconds, 0)
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.requestCount >= options.limit) {
    current.blockedUntil = now + options.blockSeconds * 1000;
    current.updatedAt = now;
    current.expiresAt = localRateLimitExpiry(
      current.windowStartedAt,
      options.windowSeconds,
      current.blockedUntil
    );
    return { allowed: false, retryAfterSeconds: options.blockSeconds };
  }

  current.requestCount += 1;
  current.updatedAt = now;
  current.expiresAt = localRateLimitExpiry(
    current.windowStartedAt,
    options.windowSeconds,
    current.blockedUntil
  );
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Exposed so tests can assert the fallback store does not grow without bound. */
export function localRateLimitEntryCount() {
  return localRateLimits.size;
}

export async function consumeRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const keyHash = createRateLimitKey(options.scope, options.identifier);
  if (globalForRateLimits.simpleCityDatabaseRateLimitsUnavailable) {
    return consumeLocalRateLimit(keyHash, options);
  }

  const { data, error } = await rateLimitSupabase().rpc("consume_security_rate_limit", {
    p_key_hash: keyHash,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
    p_block_seconds: options.blockSeconds
  });

  if (error) {
    if (isMissingRateLimitFunction(error)) {
      globalForRateLimits.simpleCityDatabaseRateLimitsUnavailable = true;
      if (!globalForRateLimits.simpleCityRateLimitFallbackWarned) {
        console.warn(
          "[SimpleCity] Supabase rate-limit migration is not installed; using process-local rate limiting."
        );
        globalForRateLimits.simpleCityRateLimitFallbackWarned = true;
      }
      return consumeLocalRateLimit(keyHash, options);
    }
    throw new Error(`Rate-limit check failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("Rate-limit check returned an invalid response.");
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds) || 0)
  };
}

export async function resetRateLimit(scope: string, identifier: string) {
  const { error } = await rateLimitSupabase().rpc("reset_security_rate_limit", {
    p_key_hash: createRateLimitKey(scope, identifier)
  });
  if (error) throw new Error(`Failed to reset rate limit: ${error.message}`);
}

export function rateLimitedResponse(
  retryAfterSeconds: number,
  message = "Too many requests. Please try again later."
) {
  const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  const response = Response.json(
    { error: message, retryAfterSeconds: retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
