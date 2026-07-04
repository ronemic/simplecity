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

function normalizeAppUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_APP_URL;
}

export function getEmailConfig(): EmailConfig {
  return {
    apiKey: readEnv("RESEND_API_KEY"),
    from: readEnv("RESEND_FROM_EMAIL"),
    replyTo: readEnv("RESEND_REPLY_TO_EMAIL") || null,
    appUrl: normalizeAppUrl(readEnv("NEXT_PUBLIC_APP_URL") || DEFAULT_APP_URL)
  };
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
