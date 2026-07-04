export type EmailConfig = {
  apiKey: string;
  from: string;
  replyTo: string | null;
  appUrl: string;
};

const DEFAULT_APP_URL = "http://localhost:3000";

function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

export function normalizeAppUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_APP_URL;
}

function isLocalAppUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return true;
  }
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

export function getEmailConfig(): EmailConfig {
  return {
    apiKey: readEnv("RESEND_API_KEY"),
    from: readEnv("RESEND_FROM_EMAIL"),
    replyTo: readEnv("RESEND_REPLY_TO_EMAIL") || null,
    appUrl: normalizeAppUrl(readEnv("NEXT_PUBLIC_APP_URL") || DEFAULT_APP_URL)
  };
}

export function getPublicAppUrlForRequest(
  request: Request,
  config: EmailConfig = getEmailConfig()
) {
  if (!isLocalAppUrl(config.appUrl)) return config.appUrl;

  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || firstForwardedValue(request.headers.get("host"));
  if (!host || host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return config.appUrl;
  }

  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProto || "https";
  return normalizeAppUrl(`${protocol}://${host}`);
}

export function hasEmailConfig(config: EmailConfig = getEmailConfig()) {
  return Boolean(config.apiKey && config.from);
}

export function requireEmailConfig(config: EmailConfig = getEmailConfig()) {
  if (!config.apiKey) {
    throw new Error("Missing RESEND_API_KEY.");
  }

  if (!config.from) {
    throw new Error("Missing RESEND_FROM_EMAIL.");
  }

  return config;
}
