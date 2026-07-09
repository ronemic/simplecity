import { getJurisdictionDisplayLabel, toPublicJurisdictionSlug } from "@/lib/config/jurisdictions";
import type { Locale } from "@/lib/i18n";
import type { SummaryCardRow } from "@/lib/types";
import { publicAgendaTitle } from "@/lib/utils/civicPriority";
import { formatDisplayDate } from "@/lib/utils/date";
import { displayMeetingType } from "@/lib/utils/meetingDisplay";

export function cardSharePath(cardId: string) {
  return `/cards/${encodeURIComponent(cardId)}`;
}

export function cardShareTitle(card: SummaryCardRow) {
  return publicAgendaTitle(card);
}

export function cardShareDescription(card: SummaryCardRow, locale: Locale = "en") {
  const summary = String(card.what_is_happening || card.why_it_matters || "")
    .replace(/\s+/g, " ")
    .trim();

  return summary || (locale === "es"
    ? "Un resumen en lenguaje claro de una decisión del gobierno local."
    : "A plain-language summary of a local government decision.");
}

export function cardSummaryPoints(card: SummaryCardRow, locale: Locale = "en") {
  const fallback = locale === "es"
    ? "No indicado en el documento fuente."
    : "Not listed in the source document.";
  const content = String(card.what_is_happening || fallback)
    .replace(/\s+/g, " ")
    .trim();
  const sentenceSafeContent = content
    .replace(/\b([A-Z])\.(?=\s+[A-Z][a-z])/g, "$1__SIMPLECITY_DOT__")
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|No|Inc|Co|Ltd|LLC)\.(?=\s+)/gi, "$1__SIMPLECITY_DOT__");

  return sentenceSafeContent
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"$“])/)
    .map((item) => item.replace(/__SIMPLECITY_DOT__/g, ".").trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function cardJurisdictionLabel(card: SummaryCardRow) {
  return getJurisdictionDisplayLabel(
    card.jurisdiction_slug || card.meetings?.jurisdiction_slug || card.jurisdiction_name
  );
}

export function cardGroupLabel(card: SummaryCardRow, locale: Locale = "en") {
  if (!card.meetings) {
    return locale === "es" ? "Grupo no indicado" : "Group not listed";
  }

  return displayMeetingType(
    card.meetings,
    locale === "es" ? "Grupo no indicado" : "Group not listed",
    locale
  );
}

export function cardMeetingDate(card: SummaryCardRow) {
  return formatDisplayDate(
    card.meetings?.date_text,
    card.meetings?.meeting_datetime,
    card.meetings?.time_text
  );
}

export function cardMeetingPath(card: SummaryCardRow) {
  if (!card.meetings?.id) return null;
  const rawJurisdiction = card.meetings.jurisdiction_slug || card.jurisdiction_slug;
  const jurisdiction = rawJurisdiction
    ? toPublicJurisdictionSlug(rawJurisdiction as Parameters<typeof toPublicJurisdictionSlug>[0])
    : null;

  return `/meetings/${card.meetings.id}${jurisdiction ? `?jurisdiction=${jurisdiction}` : ""}`;
}
