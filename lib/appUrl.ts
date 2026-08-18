export const LOCAL_APP_URL = "http://localhost:3000";
export const PRODUCTION_APP_URL = "https://simplecity.app";

function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

export function normalizeAppUrl(value: string | null | undefined, fallback = LOCAL_APP_URL) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  return trimmed || fallback;
}

function hostnameFromUrl(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function hostnameFromHost(value: string) {
  const host = value.trim();
  if (!host) return "";

  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return host.split(":")[0] || "";
  }
}

export function isLocalAppUrl(value: string | null | undefined) {
  const hostname = hostnameFromUrl(normalizeAppUrl(value));
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isLocalHost(value: string) {
  const hostname = hostnameFromHost(value);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function shouldUseProductionFallback() {
  return Boolean(
    readEnv("CI") === "true" ||
      readEnv("NODE_ENV") === "production" ||
      readEnv("RENDER") === "true" ||
      readEnv("RENDER_EXTERNAL_URL")
  );
}

export function getConfiguredAppUrl() {
  const configured = normalizeAppUrl(readEnv("NEXT_PUBLIC_APP_URL"), "");
  if (configured && !isLocalAppUrl(configured)) return configured;

  if (shouldUseProductionFallback()) {
    return PRODUCTION_APP_URL;
  }

  return configured || LOCAL_APP_URL;
}

/**
 * Resolve the public origin from request headers.
 *
 * `Host` and `X-Forwarded-Host` are attacker-controlled, so they are only
 * honoured when the configured app URL is local -- that is, in development,
 * where there is nothing to forge. Every deployed environment resolves to the
 * configured origin and ignores the headers entirely.
 *
 * Every caller that needs a request-derived origin must go through this
 * function. Re-deriving it from headers elsewhere is how a forged Host ends up
 * in generated links.
 */
export function getPublicAppUrlFromHeaders(
  getHeader: (name: string) => string | null | undefined,
  configuredAppUrl = getConfiguredAppUrl(),
  fallback: { host?: string; protocol?: string } = {}
) {
  const configured = normalizeAppUrl(configuredAppUrl);
  if (!isLocalAppUrl(configured)) return configured;

  const host =
    firstForwardedValue(getHeader("x-forwarded-host") ?? null) ||
    firstForwardedValue(getHeader("host") ?? null) ||
    fallback.host ||
    "";

  if (!host || isLocalHost(host)) return configured;

  const forwardedProto = firstForwardedValue(getHeader("x-forwarded-proto") ?? null);
  const protocol = forwardedProto || fallback.protocol || "https";
  return normalizeAppUrl(`${protocol}://${host}`);
}

export function getPublicAppUrlForRequest(
  request: Request,
  configuredAppUrl = getConfiguredAppUrl()
) {
  let requestUrl: URL | null = null;
  try {
    requestUrl = new URL(request.url);
  } catch {
    requestUrl = null;
  }

  return getPublicAppUrlFromHeaders((name) => request.headers.get(name), configuredAppUrl, {
    host: requestUrl?.host,
    protocol: requestUrl?.protocol.replace(/:$/, "")
  });
}
