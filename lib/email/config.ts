import {
  getConfiguredAppUrl,
  getPublicAppUrlForRequest as resolvePublicAppUrlForRequest
} from "@/lib/appUrl";

export type EmailConfig = {
  apiKey: string;
  from: string;
  replyTo: string | null;
  appUrl: string;
};

function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

export function getEmailConfig(): EmailConfig {
  return {
    apiKey: readEnv("RESEND_API_KEY"),
    from: readEnv("RESEND_FROM_EMAIL"),
    replyTo: readEnv("RESEND_REPLY_TO_EMAIL") || null,
    appUrl: getConfiguredAppUrl()
  };
}

export function getPublicAppUrlForRequest(
  request: Request,
  config: EmailConfig = getEmailConfig()
) {
  return resolvePublicAppUrlForRequest(request, config.appUrl);
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
