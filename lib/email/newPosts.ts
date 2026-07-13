import {
  getJurisdictionDisplayLabel,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import { normalizeAppUrl } from "@/lib/appUrl";
import { sendEmail, type SendEmailResult } from "@/lib/email/resend";
import type { SummaryCardRow } from "@/lib/types";
import { cardSharePath } from "@/lib/utils/cardShare";
import { publicAgendaTitle } from "@/lib/utils/civicPriority";
import { formatDisplayDate } from "@/lib/utils/date";
import { displayMeetingType } from "@/lib/utils/meetingDisplay";
import { categoryLabel, type Locale } from "@/lib/i18n";

type NewPostsDigestEmailInput = {
  cards: LocalizedDigestCard[];
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

export type LocalizedDigestCard = SummaryCardRow & {
  translations?: {
    es?: SummaryCardRow;
  };
};

const COPY: Record<
  Locale,
  {
    agendaFallback: string;
    meetingTypeFallback: string;
    summaryFallback: string;
    readCard: string;
    sectionLabel: string;
    intro: string;
    disclaimer: string;
    unsubscribe: string;
  }
> = {
  en: {
    agendaFallback: "Agenda item not listed",
    meetingTypeFallback: "Meeting type not listed",
    summaryFallback: "Summary not listed.",
    readCard: "Read the SimpleCity card",
    sectionLabel: "",
    intro:
      "New public-meeting summaries were published since your last digest. Here are the latest cards.",
    disclaimer:
      "SimpleCity summarizes official public meeting documents. Always check the original source before making formal decisions.",
    unsubscribe: "Unsubscribe"
  },
  es: {
    agendaFallback: "Punto de agenda no indicado",
    meetingTypeFallback: "Tipo de reunión no indicado",
    summaryFallback: "Resumen no indicado.",
    readCard: "Leer la tarjeta de SimpleCity",
    sectionLabel: "En español",
    intro:
      "Se publicaron nuevos resúmenes de reuniones públicas desde tu último resumen. Aquí están las tarjetas más recientes.",
    disclaimer:
      "SimpleCity resume documentos oficiales de reuniones públicas. Siempre revisa la fuente original antes de tomar decisiones formales.",
    unsubscribe: "Cancelar suscripción"
  }
};

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cardUrl(card: SummaryCardRow, appUrl: string, locale: Locale) {
  const url = new URL(cardSharePath(card.id), normalizeAppUrl(appUrl));
  url.searchParams.set("lang", locale);
  return url.toString();
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

function titleForCard(card: SummaryCardRow, locale: Locale) {
  if (locale === "es") {
    return compactText(card.agenda_item, COPY.es.agendaFallback);
  }

  return publicAgendaTitle(card);
}

function textLinesForCard(card: SummaryCardRow, appUrl: string, locale: Locale = "en") {
  const meeting = card.meetings;
  const title = titleForCard(card, locale);
  const jurisdiction = cardJurisdictionLabel(card);
  const meetingType = meeting
    ? displayMeetingType(meeting, COPY[locale].meetingTypeFallback, locale)
    : COPY[locale].meetingTypeFallback;
  const meetingDate = formatDisplayDate(
    meeting?.date_text,
    meeting?.meeting_datetime,
    meeting?.time_text
  );
  const summary = compactText(card.what_is_happening, COPY[locale].summaryFallback);
  const url = cardUrl(card, appUrl, locale);

  return [
    title,
    `${jurisdiction} - ${meetingType} - ${meetingDate}`,
    summary,
    url
  ];
}

function htmlForCardSection(card: SummaryCardRow, appUrl: string, locale: Locale) {
  const [title, metadata, summary, url] = textLinesForCard(card, appUrl, locale);
  const rawCategory = card.category_tags?.[0] || (locale === "es" ? "Actualización cívica" : "Civic update");
  const category = categoryLabel(locale, rawCategory) || rawCategory;
  const sectionLabel = COPY[locale].sectionLabel;
  const sectionLabelHtml = sectionLabel
    ? `<div style="margin: 0 0 8px; font-size: 12px; font-weight: 800; color: #0f5e7c;">${escapeHtml(sectionLabel)}</div>`
    : "";

  return `
        ${sectionLabelHtml}
        <div style="${locale === "es" ? `border-left: 3px solid ${EMAIL_BORDER}; padding-left: 14px; margin-top: 16px;` : ""}">
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
            ${escapeHtml(COPY[locale].readCard)}
          </a>
        </div>`;
}

function textForCard(card: LocalizedDigestCard, appUrl: string) {
  const englishLines = textLinesForCard(card, appUrl, "en");
  const spanish = card.translations?.es;

  if (!spanish) return [...englishLines, ""];

  return [
    ...englishLines,
    "",
    COPY.es.sectionLabel,
    ...textLinesForCard(spanish, appUrl, "es"),
    ""
  ];
}

function htmlForCard(card: LocalizedDigestCard, appUrl: string) {
  const spanish = card.translations?.es;

  return `
    <tr>
      <td style="padding: 18px 0; border-top: 1px solid ${EMAIL_BORDER};">
        ${htmlForCardSection(card, appUrl, "en")}
        ${spanish ? htmlForCardSection(spanish, appUrl, "es") : ""}
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
  const englishSubject =
    count === 1
      ? `Weekly SimpleCity digest: 1 new post for ${selectionLabel}`
      : `Weekly SimpleCity digest: ${count} new posts for ${selectionLabel}`;
  const spanishSubject =
    count === 1
      ? `Resumen semanal de SimpleCity: 1 publicación nueva para ${selectionLabel}`
      : `Resumen semanal de SimpleCity: ${count} publicaciones nuevas para ${selectionLabel}`;
  const subject = `${englishSubject} / ${spanishSubject}`;
  const safeAppUrl = normalizeAppUrl(appUrl);
  const preheader = "Your weekly civic updates are ready in English and Spanish.";
  const cardRows = cards.map((card) => htmlForCard(card, safeAppUrl)).join("");
  const unsubscribeFooter = unsubscribeUrl
    ? `<p style="margin: 18px 0 0; font-size: 12px; line-height: 1.5; color: ${EMAIL_MUTED};">
        <a href="${escapeHtml(unsubscribeUrl)}" style="color: ${EMAIL_MUTED};">${COPY.en.unsubscribe} / ${COPY.es.unsubscribe}</a>
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
                  ${escapeHtml(COPY.en.intro)}
                  <br>
                  ${escapeHtml(COPY.es.intro)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 28px 26px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${cardRows}
                </table>
                <p style="margin: 18px 0 0; font-size: 13px; line-height: 1.5; color: ${EMAIL_MUTED};">
                  ${escapeHtml(COPY.en.disclaimer)}
                  <br>
                  ${escapeHtml(COPY.es.disclaimer)}
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
    COPY.en.intro,
    COPY.es.intro,
    "",
    ...cards.flatMap((card) => textForCard(card, safeAppUrl)),
    COPY.en.disclaimer,
    COPY.es.disclaimer,
    unsubscribeUrl ? `${COPY.en.unsubscribe} / ${COPY.es.unsubscribe}: ${unsubscribeUrl}` : ""
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

export function labelForEmailSelections(selections: JurisdictionSelection[]) {
  if (selections.length === 1) {
    return labelForEmailSelection(selections[0]);
  }

  return `${selections.length} SimpleCity areas`;
}
