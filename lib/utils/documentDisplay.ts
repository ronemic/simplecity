import type { DocumentRow } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

type DocumentLabelSource = Pick<DocumentRow, "type" | "label">;

const DOCUMENT_TYPE_LABELS_ES: Record<string, string> = {
  "Accessible Agenda": "Agenda accesible",
  "Accessible Minutes": "Actas accesibles",
  Agenda: "Agenda",
  "Agenda Packet": "Paquete de agenda",
  Attachment: "Adjunto",
  Audio: "Audio",
  Calendar: "Calendario",
  Captions: "Subtítulos",
  Document: "Documento",
  Download: "Descarga",
  "HTML Agenda": "Agenda HTML",
  Media: "Grabación",
  "Meeting Details": "Detalles de la reunión",
  Minutes: "Actas",
  "Notice of Cancellation": "Aviso de cancelación",
  Other: "Otro",
  Packet: "Paquete",
  "Public Comments": "Comentarios públicos",
  Video: "Video"
};

const DOCUMENT_LABELS_ES: Record<string, string> = {
  Agenda: "Agenda",
  Audio: "Audio",
  Captions: "Subtítulos",
  Download: "Descarga",
  Transcript: "Transcripción",
  Video: "Video"
};

function normalize(value?: string | null) {
  return String(value || "").trim();
}

function labelKey(value?: string | null) {
  return normalize(value).replace(/\s+/g, " ");
}

function lookupSpanishLabel(labels: Record<string, string>, key: string) {
  const directMatch = labels[key];
  if (directMatch) return directMatch;

  const normalizedKey = key.toLowerCase();
  const matchedEntry = Object.entries(labels).find(([label]) => label.toLowerCase() === normalizedKey);
  return matchedEntry?.[1] || "";
}

export function displayDocumentType(document: DocumentLabelSource, locale: Locale) {
  const type = labelKey(document.type) || "Document";
  if (locale !== "es") return type;

  return lookupSpanishLabel(DOCUMENT_TYPE_LABELS_ES, type) || type;
}

export function displayDocumentLabel(
  document: DocumentLabelSource,
  locale: Locale,
  fallback = "Official source"
) {
  const label = labelKey(document.label);
  if (!label) return fallback;
  if (locale !== "es") return label;

  return lookupSpanishLabel(DOCUMENT_LABELS_ES, label) || lookupSpanishLabel(DOCUMENT_TYPE_LABELS_ES, label) || label;
}
