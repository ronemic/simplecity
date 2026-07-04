import { getEmailConfig, requireEmailConfig, type EmailConfig } from "@/lib/email/config";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

export type EmailTag = {
  name: string;
  value: string;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | string[] | null;
  headers?: Record<string, string>;
  tags?: EmailTag[];
};

export type SendEmailResult = {
  id: string;
};

export class ResendEmailError extends Error {
  status: number;
  responseText: string;

  constructor(status: number, responseText: string) {
    super(`Resend email request failed with ${status}: ${responseText.slice(0, 500)}`);
    this.name = "ResendEmailError";
    this.status = status;
    this.responseText = responseText;
  }
}

function normalizeRecipients(value: string | string[]) {
  const recipients = (Array.isArray(value) ? value : [value])
    .map((recipient) => recipient.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    throw new Error("Email recipient is required.");
  }

  return recipients;
}

function nonEmptyRecord(value?: Record<string, string>) {
  if (!value) return null;

  const entries = Object.entries(value).filter(([, item]) => item.trim());
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function parseEmailResponse(value: unknown) {
  if (typeof value === "object" && value && "id" in value && typeof value.id === "string") {
    return { id: value.id };
  }

  return null;
}

export async function sendEmail(
  input: SendEmailInput,
  config: EmailConfig = getEmailConfig()
): Promise<SendEmailResult> {
  const emailConfig = requireEmailConfig(config);
  const to = normalizeRecipients(input.to);
  const subject = input.subject.trim();

  if (!subject) {
    throw new Error("Email subject is required.");
  }

  if (!input.html?.trim() && !input.text?.trim()) {
    throw new Error("Email html or text content is required.");
  }

  const payload: Record<string, unknown> = {
    from: emailConfig.from,
    to,
    subject
  };

  if (input.html?.trim()) payload.html = input.html;
  if (input.text?.trim()) payload.text = input.text;
  if (input.replyTo) payload.reply_to = input.replyTo;
  if (!input.replyTo && emailConfig.replyTo) payload.reply_to = emailConfig.replyTo;
  if (input.tags?.length) payload.tags = input.tags;

  const headers = nonEmptyRecord(input.headers);
  if (headers) payload.headers = headers;

  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${emailConfig.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new ResendEmailError(response.status, await response.text());
  }

  const result = parseEmailResponse(await response.json().catch(() => null));
  if (!result) {
    throw new Error("Resend email response did not include an id.");
  }

  return result;
}
