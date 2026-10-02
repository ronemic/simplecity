import { normalizeAppUrl } from "@/lib/appUrl";

// Mirrors the site theme in tailwind.config.cjs and app/globals.css. Email
// clients ignore stylesheets and alpha borders unevenly, so every value here is
// an opaque hex that gets inlined.
export const EMAIL_THEME = {
  page: "#eef3f6",
  surface: "#ffffff",
  subtle: "#f7fbff",
  ink: "#171717",
  body: "#2e2e2e",
  muted: "#5e5e5e",
  faint: "#7a7a7a",
  border: "#e1e5e9",
  civic: "#2457a6",
  civicDark: "#12365f",
  civicTint: "#eaf0f9",
  outcomeBorder: "#9fc6b2",
  outcomeBackground: "#f1fbf4",
  outcomeText: "#24613c",
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
} as const;

const T = EMAIL_THEME;

export function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailEyebrow(label: string, color: string = T.civic) {
  return `<div style="font-size: 12px; font-weight: 800; line-height: 1.4; letter-spacing: .06em; text-transform: uppercase; color: ${color};">${escapeHtml(label)}</div>`;
}

export function emailPrimaryButton(href: string, label: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin: 20px 0 0;">
    <tr>
      <td style="border-radius: 8px; background: ${T.civic};">
        <a href="${escapeHtml(href)}" style="display: inline-block; padding: 13px 22px; border-radius: 8px; font-size: 15px; font-weight: 700; line-height: 1.2; color: #ffffff; text-decoration: none;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

export function emailDivider(spacing = 28) {
  return `<div style="height: 1px; margin: ${spacing}px 0; background: ${T.border}; line-height: 1px; font-size: 1px;">&nbsp;</div>`;
}

type EmailLayoutInput = {
  appUrl: string;
  lang?: string;
  preheader?: string;
  body: string;
  footer?: string;
};

export function renderEmailLayout({ appUrl, lang = "en", preheader, body, footer = "" }: EmailLayoutInput) {
  const safeAppUrl = normalizeAppUrl(appUrl);
  const logoUrl = new URL("/icon-192.png", safeAppUrl).toString();

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  </head>
  <body style="margin: 0; padding: 0; background: ${T.page}; color: ${T.ink}; font-family: ${T.font}; -webkit-font-smoothing: antialiased;">
    ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(preheader)}</div>` : ""}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${T.page};">
      <tr>
        <td align="center" style="padding: 28px 12px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px;">
            <tr>
              <td style="padding: 0 4px 16px;">
                <a href="${escapeHtml(safeAppUrl)}" style="text-decoration: none; color: ${T.ink};">
                  <table role="presentation" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="padding-right: 10px; vertical-align: middle;">
                        <img src="${escapeHtml(logoUrl)}" width="32" height="32" alt="" style="display: block; width: 32px; height: 32px; border: 0; border-radius: 8px;">
                      </td>
                      <td style="vertical-align: middle; font-size: 19px; font-weight: 900; line-height: 1; color: ${T.ink};">SimpleCity</td>
                    </tr>
                  </table>
                </a>
              </td>
            </tr>
            <tr>
              <td style="background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 10px; padding: 32px 28px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding: 22px 6px 0; font-size: 12px; line-height: 1.6; color: ${T.faint};">
                ${footer}
                <p style="margin: 10px 0 0; font-size: 12px; line-height: 1.6; color: ${T.faint};">
                  SimpleCity is an independent, student-led platform, fiscally sponsored by Hack Club, a 501(c)(3) nonprofit.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
