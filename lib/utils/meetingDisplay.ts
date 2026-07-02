import type { MeetingRow } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

const SMALL_TITLE_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "up",
  "via",
  "with"
]);

const SMALL_SPANISH_TITLE_WORDS = new Set(["de", "del", "el", "la", "las", "los", "y", "e", "en", "para", "por"]);

const SPANISH_BODY_LABELS: Record<string, string> = {
  "airport commission": "Comisión del Aeropuerto",
  "board of appeals": "Junta de Apelaciones",
  "board of education": "Junta de Educación",
  "board of library trustees": "Junta de Fideicomisarios de la Biblioteca",
  "board of supervisors": "Junta de Supervisores",
  "budget and appropriations committee": "Comité de Presupuesto y Apropiaciones",
  "budget and finance committee": "Comité de Presupuesto y Finanzas",
  "city council": "Concejo Municipal",
  "city commission": "Comisión Municipal",
  "ethics commission": "Comisión de Ética",
  "government audit and oversight committee": "Comité de Auditoría y Supervisión Gubernamental",
  "housing authority": "Autoridad de Vivienda",
  "land use and transportation committee": "Comité de Uso de Suelo y Transporte",
  "parks and recreation commission": "Comisión de Parques y Recreación",
  "parks and recreation commission and urban forestry board": "Comisión de Parques y Recreación y Junta de Silvicultura Urbana",
  "planning commission": "Comisión de Planificación",
  "police commission": "Comisión de Policía",
  "public safety and neighborhood services committee": "Comité de Seguridad Pública y Servicios Vecinales",
  "rules committee": "Comité de Reglas",
  "school board": "Junta Escolar",
  "transportation authority": "Autoridad de Transporte",
  "water district": "Distrito de Agua"
};

type MeetingLabelSource = Pick<MeetingRow, "title" | "meeting_type">;

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripNoise(value: string) {
  return collapseWhitespace(
    value
      .replace(/\u00a0/g, " ")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/\b(?:not applicable|n\/a|na)\b/gi, " ")
      .replace(/\b(?:meeting details|agenda|agenda packet|packet|minutes|video|document|calendar)\b/gi, " ")
      .replace(/[|•·]+/g, " ")
  );
}

function extractBodyName(value: string) {
  const meetingOfThe = value.match(
    /\b(?:special|regular|adjourned|special called|special joint|joint)?\s*meeting of the\s+(.+?)(?=\s+(?:https?:\/\/|not applicable|n\/a|agenda|agenda packet|packet|minutes|video|document|calendar)\b|$)/i
  );

  if (meetingOfThe?.[1]) {
    return stripNoise(meetingOfThe[1]);
  }

  const bodyMatch = value.match(
    /\b(board of supervisors|city council|city commission|planning commission|housing authority|water district|school board|board of education)\b/i
  );
  if (bodyMatch?.[1]) {
    return stripNoise(bodyMatch[1]);
  }

  return "";
}

function toTitleCase(value: string, locale: Locale = "en") {
  return value
    .split(/(\s+|\/|&|-)/)
    .map((part, index) => {
      if (/^\s+$/.test(part) || part === "/" || part === "&" || part === "-") return part;
      if (/^[A-Z0-9]{2,}$/.test(part) && part.length <= 4 && !SMALL_TITLE_WORDS.has(part.toLowerCase())) return part;

      const lower = part.toLowerCase();
      if (locale === "es" && index > 0 && SMALL_SPANISH_TITLE_WORDS.has(lower)) return lower;
      if (index > 0 && SMALL_TITLE_WORDS.has(lower)) return lower;

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("")
    .trim();
}

function translateBodyName(value: string, locale: Locale) {
  if (locale !== "es") return "";

  const normalized = value.toLowerCase();
  return SPANISH_BODY_LABELS[normalized] || "";
}

function normalizeLabel(value?: string | null, locale: Locale = "en") {
  const cleaned = stripNoise(value || "");
  if (!cleaned) return "";

  const extracted = extractBodyName(cleaned);
  const candidate = extracted || cleaned;
  const translated = translateBodyName(candidate, locale);

  return translated || toTitleCase(candidate, locale);
}

export function displayMeetingTitle(
  meeting: MeetingLabelSource,
  fallback = "Meeting not listed",
  locale: Locale = "en"
) {
  return normalizeLabel(meeting.title, locale) || normalizeLabel(meeting.meeting_type, locale) || fallback;
}

export function displayMeetingType(
  meeting: MeetingLabelSource,
  fallback = "Meeting type not listed",
  locale: Locale = "en"
) {
  return normalizeLabel(meeting.meeting_type, locale) || normalizeLabel(meeting.title, locale) || fallback;
}

export function displayMeetingText(value?: string | null, fallback = "Not listed", locale: Locale = "en") {
  return normalizeLabel(value, locale) || fallback;
}
