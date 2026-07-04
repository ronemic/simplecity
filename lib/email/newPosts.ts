import {
  getJurisdictionDisplayLabel,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import { normalizeAppUrl } from "@/lib/appUrl";
import { sendEmail, type SendEmailResult } from "@/lib/email/resend";
import type { SummaryCardRow } from "@/lib/types";
import { publicAgendaTitle } from "@/lib/utils/civicPriority";
import { formatDisplayDate } from "@/lib/utils/date";
import { displayMeetingType } from "@/lib/utils/meetingDisplay";

type NewPostsDigestEmailInput = {
  cards: SummaryCardRow[];
  appUrl: string;
  selectionLabel?: string;
  unsubscribeUrl?: string | null;
};

type SendNewPostsDigestInput = NewPostsDigestEmailInput & {
  to: string | string[];
};

const EMAIL_BACKGROUND = "#f7f3eb";
const EMAIL_INK = "#111827";
const EMAIL_MUTED = "#52606d";
const EMAIL_BORDER = "#e5ddcf";

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function publicJurisdictionParam(slug: string | null | undefined) {
  if (!slug) return null;
  if (slug === "san-mateo-city") return "san-mateo";
  return slug;
}

function cardUrl(card: SummaryCardRow, appUrl: string) {
  const baseUrl = normalizeAppUrl(appUrl);
  const meeting = card.meetings;

  if (meeting?.id) {
    const url = new URL(`/meetings/${meeting.id}`, baseUrl);
    const jurisdiction = publicJurisdictionParam(
      meeting.jurisdiction_slug || card.jurisdiction_slug
    );

    if (jurisdiction) {
      url.searchParams.set("jurisdiction", jurisdiction);
    }

    return url.toString();
  }

  return card.source_url || `${baseUrl}/decisions`;
}

function cardJurisdictionLabel(card: SummaryCardRow) {
  return getJurisdictionDisplayLabel(
    card.jurisdiction_slug || card.meetings?.jurisdiction_slug || card.jurisdiction_name
  );
}

function compactText(value: string | null | undefined, fallback: string) {
  return String(value || fallback)
    .replace(/\s+/g, " ")
    .trim();
}

function emailTagValue(value: string | null | undefined) {
  const normalized = String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return normalized || "unknown";
}

function textLinesForCard(card: SummaryCardRow, appUrl: string) {
  const meeting = card.meetings;
  const title = publicAgendaTitle(card);
  const jurisdiction = cardJurisdictionLabel(card);
  const meetingType = meeting
    ? displayMeetingType(meeting, "Meeting type not listed")
    : "Meeting type not listed";
  const meetingDate = formatDisplayDate(
    meeting?.date_text,
    meeting?.meeting_datetime,
    meeting?.time_text
  );
  const summary = compactText(card.what_is_happening, "Summary not listed.");
  const url = cardUrl(card, appUrl);

  return [
    title,
    `${jurisdiction} - ${meetingType} - ${meetingDate}`,
    summary,
    url
  ];
}

function htmlForCard(card: SummaryCardRow, appUrl: string) {
  const [title, metadata, summary, url] = textLinesForCard(card, appUrl);
  const category = card.category_tags?.[0] || "Civic update";

  return `
    <tr>
      <td style="padding: 18px 0; border-top: 1px solid ${EMAIL_BORDER};">
        <div style="font-size: 12px; font-weight: 700; color: ${EMAIL_MUTED}; text-transform: uppercase; letter-spacing: .04em;">
          ${escapeHtml(category)}
        </div>
        <h2 style="margin: 6px 0 8px; font-size: 20px; line-height: 1.25; color: ${EMAIL_INK};">
          ${escapeHtml(title)}
        </h2>
        <p style="margin: 0 0 10px; font-size: 14px; line-height: 1.5; color: ${EMAIL_MUTED};">
          ${escapeHtml(metadata)}
        </p>
        <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6; color: ${EMAIL_INK};">
          ${escapeHtml(summary)}
        </p>
        <a href="${escapeHtml(url)}" style="display: inline-block; color: #0f5e7c; font-weight: 800; text-decoration: none;">
          Read the SimpleCity card
        </a>
      </td>
    </tr>`;
}

export function buildNewPostsDigestEmail({
  cards,
  appUrl,
  selectionLabel = "your area",
  unsubscribeUrl
}: NewPostsDigestEmailInput) {
  const count = cards.length;
  const subject =
    count === 1
      ? `1 new SimpleCity post for ${selectionLabel}`
      : `${count} new SimpleCity posts for ${selectionLabel}`;
  const safeAppUrl = normalizeAppUrl(appUrl);
  const preheader = "Fresh plain-English civic updates are ready.";
  const cardRows = cards.map((card) => htmlForCard(card, safeAppUrl)).join("");
  const unsubscribeFooter = unsubscribeUrl
    ? `<p style="margin: 18px 0 0; font-size: 12px; line-height: 1.5; color: ${EMAIL_MUTED};">
        <a href="${escapeHtml(unsubscribeUrl)}" style="color: ${EMAIL_MUTED};">Unsubscribe</a>
      </p>`
    : "";

  const html = `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: ${EMAIL_BACKGROUND}; color: ${EMAIL_INK}; font-family: Arial, Helvetica, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${EMAIL_BACKGROUND}; padding: 24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; background: #ffffff; border: 1px solid ${EMAIL_BORDER}; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="padding: 28px 28px 10px;">
                <div style="font-size: 14px; font-weight: 900; color: #0f5e7c;">SimpleCity</div>
                <h1 style="margin: 8px 0 8px; font-size: 28px; line-height: 1.15; color: ${EMAIL_INK};">
                  ${escapeHtml(subject)}
                </h1>
                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: ${EMAIL_MUTED};">
                  New public-meeting summaries were published. Here are the latest cards.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 28px 26px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${cardRows}
                </table>
                <p style="margin: 18px 0 0; font-size: 13px; line-height: 1.5; color: ${EMAIL_MUTED};">
                  SimpleCity summarizes official public meeting documents. Always check the original source before making formal decisions.
                </p>
                ${unsubscribeFooter}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    subject,
    "",
    "New public-meeting summaries were published. Here are the latest cards.",
    "",
    ...cards.flatMap((card) => [...textLinesForCard(card, safeAppUrl), ""]),
    "SimpleCity summarizes official public meeting documents. Always check the original source before making formal decisions.",
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : ""
  ]
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n");

  return { subject, html, text };
}

export async function sendNewPostsDigestEmail({
  to,
  cards,
  appUrl,
  selectionLabel,
  unsubscribeUrl
}: SendNewPostsDigestInput): Promise<SendEmailResult> {
  const email = buildNewPostsDigestEmail({
    cards,
    appUrl,
    selectionLabel,
    unsubscribeUrl
  });

  return sendEmail({
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: [
      { name: "kind", value: "new_posts_digest" },
      { name: "jurisdiction", value: emailTagValue(selectionLabel) }
    ]
  });
}

export function labelForEmailSelection(selection: JurisdictionSelection) {
  return selection === "all" ? "all SimpleCity cities" : getJurisdictionDisplayLabel(selection);
}
