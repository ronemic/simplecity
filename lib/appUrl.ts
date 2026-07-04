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

export function getPublicAppUrlForRequest(
  request: Request,
  configuredAppUrl = getConfiguredAppUrl()
) {
  const configured = normalizeAppUrl(configuredAppUrl);
  if (!isLocalAppUrl(configured)) return configured;

  let requestUrl: URL | null = null;
  try {
    requestUrl = new URL(request.url);
  } catch {
    requestUrl = null;
  }

  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const host =
    forwardedHost ||
    firstForwardedValue(request.headers.get("host")) ||
    requestUrl?.host ||
    "";

  if (!host || isLocalHost(host)) return configured;

  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProto || requestUrl?.protocol.replace(/:$/, "") || "https";
  return normalizeAppUrl(`${protocol}://${host}`);
}
