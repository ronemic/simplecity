import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDefaultJurisdiction,
  getJurisdictionDisplayLabel,
  getPublicJurisdictionOptions,
  getServiceSupabaseClientForJurisdiction,
  requireValidJurisdictionSlug,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";
import { getEmailConfig } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/resend";

export type EmailSubscriberStatus = "pending" | "active" | "unsubscribed";
export type EmailFrequency = "daily";

export type EmailSubscriberRow = {
  id: string;
  email: string;
  email_normalized: string;
  status: EmailSubscriberStatus;
  pending_jurisdiction_slugs: string[] | null;
  confirmation_token_hash: string | null;
  unsubscribe_token: string;
  confirmation_sent_at: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type EmailSubscriptionRow = {
  id: string;
  subscriber_id: string;
  jurisdiction_slug: JurisdictionSlug;
  frequency: EmailFrequency;
  last_digest_sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type EmailSubscriberWithSubscriptions = EmailSubscriberRow & {
  email_subscriptions?: EmailSubscriptionRow[];
};

type SubscribeInput = {
  email: string;
  jurisdictions: string[];
  baseUrl?: string;
};

type SubscriptionClient = Pick<SupabaseClient, "from">;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_BYTES = 32;

function subscriptionSupabase() {
  return getServiceSupabaseClientForJurisdiction(getDefaultJurisdiction().slug);
}

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAppUrl(value: string) {
  return value.replace(/\/+$/, "") || "http://localhost:3000";
}

function appUrl() {
  return getEmailConfig().appUrl;
}

function confirmationUrl(token: string, baseUrl = appUrl()) {
  const url = new URL("/api/email/confirm", normalizeAppUrl(baseUrl));
  url.searchParams.set("token", token);
  return url.toString();
}

export function unsubscribeUrl(token: string, baseUrl = appUrl()) {
  const url = new URL("/api/email/unsubscribe", normalizeAppUrl(baseUrl));
  url.searchParams.set("token", token);
  return url.toString();
}

export function normalizeSubscriberEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidSubscriberEmail(email: string) {
  const normalized = normalizeSubscriberEmail(email);
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

export function hashEmailToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createEmailToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function publicEmailJurisdictionOptions() {
  return getPublicJurisdictionOptions()
    .filter((jurisdiction) => jurisdiction.slug !== "all")
    .map((jurisdiction) => ({
      value: requireValidJurisdictionSlug(jurisdiction.slug) as JurisdictionSlug,
      label: jurisdiction.name
    }));
}

export function normalizeSubscriptionJurisdictions(values: string[]) {
  const seen = new Set<JurisdictionSlug>();

  for (const value of values) {
    const jurisdiction = requireValidJurisdictionSlug(value);
    if (jurisdiction === "all") continue;
    seen.add(jurisdiction);
  }

  return [...seen];
}

function subscriptionLabels(jurisdictions: JurisdictionSlug[]) {
  return jurisdictions.map((jurisdiction) => getJurisdictionDisplayLabel(jurisdiction));
}

function buildConfirmationEmail({
  email,
  jurisdictions,
  token,
  baseUrl = appUrl()
}: {
  email: string;
  jurisdictions: JurisdictionSlug[];
  token: string;
  baseUrl?: string;
}) {
  const link = confirmationUrl(token, baseUrl);
  const labels = subscriptionLabels(jurisdictions);
  const labelText = labels.length === 1 ? labels[0] : labels.join(", ");
  const subject = "Confirm your SimpleCity email updates";
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f3eb;color:#111827;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3eb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5ddcf;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px;">
                <div style="font-size:14px;font-weight:900;color:#0f5e7c;">SimpleCity</div>
                <h1 style="margin:8px 0 10px;font-size:26px;line-height:1.15;color:#111827;">Confirm your email updates</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#52606d;">
                  Please confirm that ${escapeHtml(email)} should receive daily SimpleCity digests for ${escapeHtml(labelText)}.
                </p>
                <a href="${escapeHtml(link)}" style="display:inline-block;border-radius:8px;background:#2457a6;color:#ffffff;font-weight:800;text-decoration:none;padding:12px 18px;">
                  Confirm subscription
                </a>
                <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#52606d;">
                  If you did not request this, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    "Confirm your SimpleCity email updates",
    "",
    `Please confirm that ${email} should receive daily SimpleCity digests for ${labelText}.`,
    "",
    link,
    "",
    "If you did not request this, you can ignore this email."
  ].join("\n");

  return { subject, html, text };
}

async function getSubscriberByEmail(supabase: SubscriptionClient, emailNormalized: string) {
  const { data, error } = await supabase
    .from("email_subscribers")
    .select("*")
    .eq("email_normalized", emailNormalized)
    .maybeSingle();

  if (error) throw new Error(`Failed to load subscriber: ${error.message}`);
  return (data || null) as EmailSubscriberRow | null;
}

export async function createOrRefreshSubscription(
  input: SubscribeInput,
  supabase: SubscriptionClient = subscriptionSupabase()
) {
  const emailNormalized = normalizeSubscriberEmail(input.email);
  if (!isValidSubscriberEmail(emailNormalized)) {
    throw new Error("Enter a valid email address.");
  }

  const jurisdictions = normalizeSubscriptionJurisdictions(input.jurisdictions);
  if (jurisdictions.length === 0) {
    throw new Error("Choose at least one city or county.");
  }

  const confirmationToken = createEmailToken();
  const confirmationTokenHash = hashEmailToken(confirmationToken);
  const now = new Date().toISOString();
  const existing = await getSubscriberByEmail(supabase, emailNormalized);
  let subscriber: EmailSubscriberRow;

  if (existing) {
    const { data, error } = await supabase
      .from("email_subscribers")
      .update({
        email: input.email.trim(),
        status: existing.status === "active" ? "active" : "pending",
        pending_jurisdiction_slugs: jurisdictions,
        confirmation_token_hash: confirmationTokenHash,
        confirmation_sent_at: now,
        unsubscribed_at: null
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw new Error(`Failed to update subscriber: ${error.message}`);
    subscriber = data as EmailSubscriberRow;
  } else {
    const { data, error } = await supabase
      .from("email_subscribers")
      .insert({
        email: input.email.trim(),
        email_normalized: emailNormalized,
        status: "pending",
        pending_jurisdiction_slugs: jurisdictions,
        confirmation_token_hash: confirmationTokenHash,
        unsubscribe_token: createEmailToken(),
        confirmation_sent_at: now
      })
      .select("*")
      .single();

    if (error) throw new Error(`Failed to create subscriber: ${error.message}`);
    subscriber = data as EmailSubscriberRow;
  }

  const email = buildConfirmationEmail({
    email: subscriber.email,
    jurisdictions,
    token: confirmationToken,
    baseUrl: input.baseUrl
  });

  await sendEmail({
    to: subscriber.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: [
      { name: "kind", value: "subscription_confirmation" },
      { name: "subscriber_status", value: subscriber.status }
    ]
  });

  return {
    subscriber,
    jurisdictions,
    confirmationToken
  };
}

export async function confirmEmailSubscription(
  token: string,
  supabase: SubscriptionClient = subscriptionSupabase()
) {
  const tokenHash = hashEmailToken(token.trim());
  const { data, error } = await supabase
    .from("email_subscribers")
    .select("*")
    .eq("confirmation_token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(`Failed to confirm subscription: ${error.message}`);
  const subscriber = data as EmailSubscriberRow | null;
  if (!subscriber) return null;

  const jurisdictions = normalizeSubscriptionJurisdictions(
    subscriber.pending_jurisdiction_slugs || []
  );
  if (jurisdictions.length === 0) {
    return subscriber.status === "active" ? subscriber : null;
  }

  const now = new Date().toISOString();
  const { error: deleteError } = await supabase
    .from("email_subscriptions")
    .delete()
    .eq("subscriber_id", subscriber.id);

  if (deleteError) throw new Error(`Failed to refresh subscriptions: ${deleteError.message}`);

  const { error: insertError } = await supabase.from("email_subscriptions").insert(
    jurisdictions.map((jurisdiction) => ({
      subscriber_id: subscriber.id,
      jurisdiction_slug: jurisdiction,
      frequency: "daily",
      last_digest_sent_at: now
    }))
  );

  if (insertError) throw new Error(`Failed to save subscriptions: ${insertError.message}`);

  const { data: updated, error: updateError } = await supabase
    .from("email_subscribers")
    .update({
      status: "active",
      pending_jurisdiction_slugs: [],
      confirmed_at: now,
      unsubscribed_at: null
    })
    .eq("id", subscriber.id)
    .select("*")
    .single();

  if (updateError) throw new Error(`Failed to activate subscription: ${updateError.message}`);
  return updated as EmailSubscriberRow;
}

export async function unsubscribeEmailSubscriber(
  token: string,
  supabase: SubscriptionClient = subscriptionSupabase()
) {
  const { data, error } = await supabase
    .from("email_subscribers")
    .select("*")
    .eq("unsubscribe_token", token.trim())
    .maybeSingle();

  if (error) throw new Error(`Failed to load unsubscribe token: ${error.message}`);
  const subscriber = data as EmailSubscriberRow | null;
  if (!subscriber) return null;

  const { data: updated, error: updateError } = await supabase
    .from("email_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString()
    })
    .eq("id", subscriber.id)
    .select("*")
    .single();

  if (updateError) throw new Error(`Failed to unsubscribe: ${updateError.message}`);
  return updated as EmailSubscriberRow;
}

export async function getActiveSubscribersForDigest(
  supabase: SubscriptionClient = subscriptionSupabase()
) {
  const { data, error } = await supabase
    .from("email_subscribers")
    .select("*,email_subscriptions(*)")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load digest subscribers: ${error.message}`);

  return ((data || []) as EmailSubscriberWithSubscriptions[])
    .map((subscriber) => ({
      ...subscriber,
      email_subscriptions: (subscriber.email_subscriptions || []).filter(
        (subscription) => subscription.frequency === "daily"
      )
    }))
    .filter((subscriber) => (subscriber.email_subscriptions || []).length > 0);
}

export async function updateSubscriptionDigestTimestamp(
  subscriptionIds: string[],
  sentAt: string,
  supabase: SubscriptionClient = subscriptionSupabase()
) {
  if (subscriptionIds.length === 0) return;

  const { error } = await supabase
    .from("email_subscriptions")
    .update({ last_digest_sent_at: sentAt })
    .in("id", subscriptionIds);

  if (error) throw new Error(`Failed to update digest timestamps: ${error.message}`);
}

export async function recordDigestDelivery(
  input: {
    subscriberId: string;
    jurisdictionSlugs: JurisdictionSlug[];
    cardIds: string[];
    status: "sent" | "failed" | "skipped";
    providerMessageId?: string | null;
    error?: string | null;
    sentAt?: string | null;
  },
  supabase: SubscriptionClient = subscriptionSupabase()
) {
  const { error } = await supabase.from("email_digest_deliveries").insert({
    subscriber_id: input.subscriberId,
    jurisdiction_slugs: input.jurisdictionSlugs,
    card_ids: input.cardIds,
    status: input.status,
    provider_message_id: input.providerMessageId || null,
    error: input.error || null,
    sent_at: input.sentAt || null
  });

  if (error) throw new Error(`Failed to record digest delivery: ${error.message}`);
}
