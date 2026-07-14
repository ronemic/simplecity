import { getJurisdictionDisplayLabel, toPublicJurisdictionSlug } from "@/lib/config/jurisdictions";
import type { Locale } from "@/lib/i18n";
import type { SummaryCardRow } from "@/lib/types";
import { publicAgendaTitle } from "@/lib/utils/civicPriority";
import { formatDisplayDate } from "@/lib/utils/date";
import { displayMeetingType } from "@/lib/utils/meetingDisplay";
import { normalizeSummaryPoints, summaryPointsText } from "@/lib/utils/summaryPoints";

export function cardSharePath(cardId: string) {
  return `/cards/${encodeURIComponent(cardId)}`;
}

export function cardShareTitle(card: SummaryCardRow) {
  return publicAgendaTitle(card);
}

export function cardShareDescription(card: SummaryCardRow, locale: Locale = "en") {
  const summary = summaryPointsText(card.what_is_happening) || String(card.why_it_matters || "").trim();

  return summary || (locale === "es"
    ? "Un resumen en lenguaje claro de una decisión del gobierno local."
    : "A plain-language summary of a local government decision.");
}

export function cardSummaryPoints(card: SummaryCardRow, locale: Locale = "en") {
  const fallback = locale === "es"
    ? "No indicado en el documento fuente."
    : "Not listed in the source document.";
  const points = normalizeSummaryPoints(card.what_is_happening).slice(0, 3);
  return points.length > 0 ? points : [fallback];
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
