import type { MeetingRow } from "@/lib/types";

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

function toTitleCase(value: string) {
  return value
    .split(/(\s+|\/|&|-)/)
    .map((part, index) => {
      if (/^\s+$/.test(part) || part === "/" || part === "&" || part === "-") return part;
      if (/^[A-Z0-9]{2,}$/.test(part) && part.length <= 4 && !SMALL_TITLE_WORDS.has(part.toLowerCase())) return part;

      const lower = part.toLowerCase();
      if (index > 0 && SMALL_TITLE_WORDS.has(lower)) return lower;

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("")
    .trim();
}

function normalizeLabel(value?: string | null) {
  const cleaned = stripNoise(value || "");
  if (!cleaned) return "";

  const extracted = extractBodyName(cleaned);
  const candidate = extracted || cleaned;

  return toTitleCase(candidate);
}

export function displayMeetingTitle(meeting: MeetingLabelSource, fallback = "Meeting not listed") {
  return normalizeLabel(meeting.title) || normalizeLabel(meeting.meeting_type) || fallback;
}

export function displayMeetingType(meeting: MeetingLabelSource, fallback = "Meeting type not listed") {
  return normalizeLabel(meeting.meeting_type) || normalizeLabel(meeting.title) || fallback;
}

export function displayMeetingText(value?: string | null, fallback = "Not listed") {
  return normalizeLabel(value) || fallback;
}
