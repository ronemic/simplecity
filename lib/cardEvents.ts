import { statusLabel, type Locale } from "@/lib/i18n";
import { CIVIC_TIME_ZONE, formatPacificTimestamp } from "@/lib/utils/date";

export const CARD_EVENT_KINDS = [
  "posted",
  "status_changed",
  "outcome_recorded",
  "outcome_changed",
  "outcome_vote_changed",
  "outcome_date_changed",
  "meeting_cancelled",
  "meeting_reinstated",
  "meeting_rescheduled"
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
    approved: "Aprobada",
    rejected: "Rechazada",
    continued: "Aplazada",
    amended: "Modificada",
    other: "Otra acción"
  }
};

function outcomeLabel(locale: Locale, kind: string | null) {
  if (!kind) return locale === "es" ? "Desconocido" : "Unknown";
  return outcomeKindLabels[locale][kind] || kind;
}

function scheduleLabel(value: string | null, locale: Locale) {
  if (!value) return null;
  // Database timestamps are stored as UTC ISO strings. Older or unparseable
  // meeting dates are kept as source text and must not be assigned a timezone.
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
    ? formatPacificTimestamp(value, locale) || value
    : value;
}

function decisionDateLabel(value: string | null, locale: Locale) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
    ? formatCardEventDate(value, locale) || value
    : value;
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
    case "outcome_vote_changed":
      if (event.previous_value && event.new_value) {
        return es
          ? `Votación oficial corregida de ${event.previous_value} a ${event.new_value}`
          : `Official vote corrected from ${event.previous_value} to ${event.new_value}`;
      }
      if (event.new_value) {
        return es ? `Votación oficial agregada: ${event.new_value}` : `Official vote added: ${event.new_value}`;
      }
      return es ? "Votación oficial eliminada" : "Official vote removed";
    case "outcome_date_changed": {
      const previous = decisionDateLabel(event.previous_value, locale);
      const next = decisionDateLabel(event.new_value, locale);
      if (previous && next) {
        return es
          ? `Fecha de la decisión corregida de ${previous} a ${next}`
          : `Decision date corrected from ${previous} to ${next}`;
      }
      if (next) return es ? `Fecha de la decisión agregada: ${next}` : `Decision date added: ${next}`;
      return es ? "Fecha de la decisión eliminada" : "Decision date removed";
    }
    case "meeting_cancelled":
      return es ? "Reunión cancelada" : "Meeting cancelled";
    case "meeting_reinstated":
      return es ? "La reunión volvió al calendario" : "Meeting back on the schedule";
    case "meeting_rescheduled": {
      const previous = scheduleLabel(event.previous_value, locale);
      const next = scheduleLabel(event.new_value, locale);
      if (previous && next) {
        return es ? `Reunión reprogramada de ${previous} a ${next}` : `Meeting rescheduled from ${previous} to ${next}`;
      }
      if (next) return es ? `Reunión programada para ${next}` : `Meeting scheduled for ${next}`;
      return es ? "Fecha de la reunión eliminada" : "Meeting date removed";
    }
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
