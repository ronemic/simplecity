import { statusLabel, type Locale } from "@/lib/i18n";
import { CIVIC_TIME_ZONE } from "@/lib/utils/date";

export const CARD_EVENT_KINDS = [
  "posted",
  "status_changed",
  "outcome_recorded",
  "outcome_changed",
  "meeting_cancelled",
  "meeting_reinstated"
] as const;

export type CardEventKind = (typeof CARD_EVENT_KINDS)[number];

export type CardEvent = {
  id: string;
  summary_card_id: string;
  kind: CardEventKind;
  previous_value: string | null;
  new_value: string | null;
  occurred_at: string;
  created_at: string;
};

export const PUBLIC_CARD_EVENT_COLUMNS =
  "id,summary_card_id,kind,previous_value,new_value,occurred_at,created_at";

const outcomeKindLabels: Record<Locale, Record<string, string>> = {
  en: {
    approved: "Approved",
    rejected: "Rejected",
    continued: "Continued",
    amended: "Amended",
    other: "Other action"
  },
  es: {
    approved: "Aprobado",
    rejected: "Rechazado",
    continued: "Aplazado",
    amended: "Modificado",
    other: "Otra acción"
  }
};

function outcomeLabel(locale: Locale, kind: string | null) {
  if (!kind) return locale === "es" ? "Desconocido" : "Unknown";
  return outcomeKindLabels[locale][kind] || kind;
}

export function cardEventLabel(event: CardEvent, locale: Locale) {
  const es = locale === "es";
  switch (event.kind) {
    case "posted":
      return es ? "Agregado a SimpleCity" : "Added to SimpleCity";
    case "status_changed":
      return es
        ? `Estado cambiado de ${statusLabel(locale, event.previous_value)} a ${statusLabel(locale, event.new_value)}`
        : `Status changed from ${statusLabel(locale, event.previous_value)} to ${statusLabel(locale, event.new_value)}`;
    case "outcome_recorded":
      return es
        ? `Resultado oficial: ${outcomeLabel(locale, event.new_value)}`
        : `Official result: ${outcomeLabel(locale, event.new_value)}`;
    case "outcome_changed":
      return es
        ? `Resultado oficial cambiado de ${outcomeLabel(locale, event.previous_value)} a ${outcomeLabel(locale, event.new_value)}`
        : `Official result changed from ${outcomeLabel(locale, event.previous_value)} to ${outcomeLabel(locale, event.new_value)}`;
    case "meeting_cancelled":
      return es ? "Reunión cancelada" : "Meeting cancelled";
    case "meeting_reinstated":
      return es ? "La reunión volvió al calendario" : "Meeting back on the schedule";
  }
}

export function formatCardEventDate(value: string, locale: Locale) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: CIVIC_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

export function sortCardEvents(events: CardEvent[]) {
  return [...events].sort(
    (a, b) =>
      Date.parse(a.occurred_at) - Date.parse(b.occurred_at) ||
      Date.parse(a.created_at) - Date.parse(b.created_at)
  );
}

/** Events SimpleCity recorded after `since`, regardless of when they occurred. */
export function cardEventsRecordedAfter(events: CardEvent[], since: string | null) {
  const sinceTime = Date.parse(since || "");
  if (Number.isNaN(sinceTime)) return [];
  return events.filter((event) => Date.parse(event.created_at) > sinceTime);
}

export function latestCardEventRecordedAt(events: CardEvent[]) {
  let latest: string | null = null;
  for (const event of events) {
    if (!latest || Date.parse(event.created_at) > Date.parse(latest)) latest = event.created_at;
  }
  return latest;
}
