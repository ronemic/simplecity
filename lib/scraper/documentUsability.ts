import type { PrimeGovDocument } from "@/lib/types";

export const MIN_USABLE_OFFICIAL_DOCUMENT_CHARACTERS = 40;
const MAX_ERROR_RESPONSE_CHARACTERS = 10_000;

const OFFICIAL_DOCUMENT_ERROR_PATTERNS = [
  /\baccess denied\b/i,
  /\b(?:401 unauthorized|403 forbidden|404 not found|502 bad gateway|503 service unavailable|504 gateway timeout)\b/i,
  /\b(?:cloudflare ray id|checking your browser|verify (?:that )?you are (?:a )?human|captcha)\b/i,
  /\brequest unsuccessful\.?.*\bincapsula incident id\b/i,
  /\b(?:oops[.!\s]*(?:an )?error occurred|a problem has occurred on this web site)\b/i,
  /^\s*(?:internal server error|service unavailable|request (?:was )?blocked|forbidden|unauthorized)\b/i,
  /<(?:!doctype|html|head|body|script)\b/i
];

export function isUsableOfficialSourceText(
  value?: string | null,
  minimumCharacters = MIN_USABLE_OFFICIAL_DOCUMENT_CHARACTERS
) {
  const text = String(value || "").trim();
  if (text.length < minimumCharacters) return false;
  if (
    text.length <= MAX_ERROR_RESPONSE_CHARACTERS &&
    OFFICIAL_DOCUMENT_ERROR_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    return false;
  }
  return true;
}

export function hasUsableOfficialDocumentText(
  document: Pick<PrimeGovDocument, "downloadError" | "extractedText">,
  minimumCharacters = MIN_USABLE_OFFICIAL_DOCUMENT_CHARACTERS
) {
  return (
    !document.downloadError &&
    isUsableOfficialSourceText(document.extractedText, minimumCharacters)
  );
}
