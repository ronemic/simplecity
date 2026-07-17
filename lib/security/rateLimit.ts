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
};

const globalForRateLimits = globalThis as typeof globalThis & {
  simpleCityLocalRateLimits?: Map<string, LocalRateLimitEntry>;
  simpleCityRateLimitFallbackWarned?: boolean;
  simpleCityDatabaseRateLimitsUnavailable?: boolean;
};

const localRateLimits = globalForRateLimits.simpleCityLocalRateLimits ?? new Map<string, LocalRateLimitEntry>();
globalForRateLimits.simpleCityLocalRateLimits = localRateLimits;

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
      updatedAt: now
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.requestCount >= options.limit) {
    current.blockedUntil = now + options.blockSeconds * 1000;
    current.updatedAt = now;
    return { allowed: false, retryAfterSeconds: options.blockSeconds };
  }

  current.requestCount += 1;
  current.updatedAt = now;
  return { allowed: true, retryAfterSeconds: 0 };
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
  return Response.json(
    { error: message, retryAfterSeconds: retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
