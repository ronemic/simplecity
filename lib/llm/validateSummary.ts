import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import { CATEGORIES } from "@/lib/constants";
import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";
import { getCommentDeadlineInfo } from "@/lib/utils/commentDeadline";

const allowedCategories = new Set<string>(CATEGORIES);
const allowedStatuses = new Set([
  "Upcoming vote",
  "Under discussion",
  "Passed",
  "Tabled",
  "Cancelled",
  "Information only"
]);
const confidenceRank = {
  low: 0,
  medium: 1,
  high: 2
} as const;
const MISSING_SOURCE_VALUE = "Not listed in the source document.";
const GROUNDABLE_VALUE_PATTERNS = [
  /https?:\/\/[^\s)"']+/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}\b/g,
  /\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand|m|bn|k))?/gi,
  /\b\d+(?:\.\d+)?\s?%/gi,
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi,
  /\b(?:agenda\s+item|item|resolution|ordinance)\s+(?:no\.?\s*)?[A-Z]?\d[\w.-]*/gi,
  /\b\d[\d,]*(?:\.\d+)?\s*(?:units?|homes?|acres?|feet|ft|sq\.?\s*ft|square\s+feet|days?|months?|years?|hours?|percent|million|billion|thousand)\b/gi
];

const CardSchema = z.object({
  agendaItem: z.string().min(1),
  whatIsHappening: z.string().min(1),
  whyItMatters: z.string().min(1),
  whoItAffects: z.array(z.string()).default([]),
  categoryTags: z.array(z.string()).default([]),
  status: z.string().min(1),
  commentWindow: z
    .object({
      opens: z.string().default("Not listed in the source document."),
      closes: z.string().default("Not listed in the source document.")
    })
    .default({
      opens: "Not listed in the source document.",
      closes: "Not listed in the source document."
    }),
  howToAct: z
    .object({
      attend: z.string().default("Not listed in the source document."),
      email: z.string().default("Not listed in the source document."),
      submitComment: z.string().default("Not listed in the source document.")
    })
    .default({
      attend: "Not listed in the source document.",
      email: "Not listed in the source document.",
      submitComment: "Not listed in the source document."
    }),
  source: z.string().default(""),
  confidence: z.enum(["high", "medium", "low"]).default("medium")
});

const SummarySchema = z.object({
  meetingSummary: z.object({
    title: z.string().default(""),
    date: z.string().default(""),
    status: z.string().default(""),
    oneSentenceSummary: z.string().default("")
  }),
  cards: z.array(CardSchema).default([])
});

export type SummaryValidationIssue = {
  agendaItem?: string;
  reason: string;
  value?: string;
};

export type SummaryValidationOptions = {
  fallbackSource?: string;
  allowedSourceUrls?: string[];
  sourceText?: string;
  maxConfidence?: "high" | "medium" | "low";
  onIssue?: (issue: SummaryValidationIssue) => void;
};

function normalizeValidationOptions(
  input?: string | SummaryValidationOptions
): SummaryValidationOptions {
  if (typeof input === "string") return { fallbackSource: input };
  return input || {};
}

function normalizeEvidenceText(value = "") {
  return value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value = "") {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function extractGroundableValues(text: string) {
  const values: string[] = [];

  for (const pattern of GROUNDABLE_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      values.push(match[0]);
    }
  }

  return uniqueValues(values);
}

function isGroundedValue(value: string, sourceText: string) {
  const normalizedValue = normalizeEvidenceText(value);
  if (!normalizedValue) return true;
  return normalizeEvidenceText(sourceText).includes(normalizedValue);
}

function capConfidence(
  value: "high" | "medium" | "low",
  maxConfidence: "high" | "medium" | "low"
) {
  return confidenceRank[value] <= confidenceRank[maxConfidence] ? value : maxConfidence;
}

function cleanStatus(status: string) {
  const normalized = status.trim();
  if (normalized.toLowerCase() === "info only") return "Information only";
  return normalized;
}

function resolveOfficialSource(source: string, options: SummaryValidationOptions) {
  const fallback = options.fallbackSource?.trim() || "";
  const allowedUrls = uniqueValues([fallback, ...(options.allowedSourceUrls || [])]).map(normalizeUrl);
  const normalizedSource = normalizeUrl(source);

  if (normalizedSource && allowedUrls.includes(normalizedSource)) return source.trim();
  return fallback;
}

function cardGroundingText(card: z.infer<typeof CardSchema>) {
  return [
    card.agendaItem,
    card.whatIsHappening,
    card.whyItMatters,
    card.status,
    card.commentWindow.opens,
    card.commentWindow.closes,
    card.howToAct.attend,
    card.howToAct.email,
    card.howToAct.submitComment
  ]
    .filter((value) => value && value !== MISSING_SOURCE_VALUE)
    .join(" ");
}

function cardDedupeKey(card: SimpleCitySummary["cards"][number]) {
  return `${normalizeEvidenceText(card.agendaItem)}|${normalizeUrl(card.source)}`;
}

function buildMeetingSourceText(meeting: LlmReadyMeeting) {
  return [
    meeting.title,
    meeting.meetingType,
    meeting.dateText,
    meeting.timeText,
    meeting.status,
    meeting.sourceType,
    meeting.sourceUrl,
    meeting.source,
    meeting.meetingDetailsUrl,
    meeting.llmInputText,
    meeting.publicCommentsInputText,
    ...meeting.documents.flatMap((doc) => [doc.url, doc.label])
  ]
    .filter(Boolean)
    .join("\n");
}

function maxConfidenceForMeeting(meeting: LlmReadyMeeting): "high" | "medium" | "low" {
  const notes = (meeting.extractionNotes || []).join(" ").toLowerCase();
  const sourceType = (meeting.sourceType || "").toLowerCase();
  const input = meeting.llmInputText || "";

  if (!input || input.length < 300) return "low";
  if (sourceType.includes("row text")) return "low";
  if (sourceType.includes("detail page")) return "medium";
  if (input.includes("[TRUNCATED:")) return "medium";
  if (/little|no usable|no extractable|scanned|failed|error/.test(notes)) return "medium";
  return "high";
}

export function validationOptionsForMeeting(
  meeting: LlmReadyMeeting,
  onIssue?: (issue: SummaryValidationIssue) => void
): SummaryValidationOptions {
  return {
    fallbackSource: meeting.sourceUrl || "",
    allowedSourceUrls: [
      meeting.sourceUrl,
      meeting.source,
      meeting.meetingDetailsUrl,
      ...meeting.documents.map((doc) => doc.url)
    ].filter((url): url is string => Boolean(url)),
    sourceText: buildMeetingSourceText(meeting),
    maxConfidence: maxConfidenceForMeeting(meeting),
    onIssue
  };
}

export function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");

  if (first === -1 || last === -1 || last <= first) {
    throw new Error("LLM response did not contain a JSON object.");
  }

  return trimmed.slice(first, last + 1);
}

export function parsePossiblyWrappedJson(raw: string) {
  const json = extractJsonObject(raw);

  try {
    return JSON.parse(json) as unknown;
  } catch {
    const repaired = jsonrepair(json);
    return JSON.parse(repaired) as unknown;
  }
}

export function validateSimpleCitySummary(
  raw: unknown,
  validationOptions?: string | SummaryValidationOptions
): SimpleCitySummary {
  const options = normalizeValidationOptions(validationOptions);
  const parsed = SummarySchema.parse(raw);
  const sourceText = options.sourceText || "";
  const maxConfidence = options.maxConfidence || "high";

  const cards = parsed.cards
    .map((card) => {
      const howToAct = {
        attend: card.howToAct.attend.trim(),
        email: card.howToAct.email.trim(),
        submitComment: card.howToAct.submitComment.trim()
      };
      const commentWindow = {
        opens: card.commentWindow.opens.trim(),
        closes: card.commentWindow.closes.trim()
      };
      const commentDeadline = getCommentDeadlineInfo({
        closes: commentWindow.closes,
        actionTexts: [howToAct.submitComment, howToAct.email]
      });
      const status = cleanStatus(card.status);
      const source = resolveOfficialSource(card.source, options);
      const unsupportedValues = sourceText
        ? extractGroundableValues(cardGroundingText(card)).filter(
            (value) => !isGroundedValue(value, sourceText)
          )
        : [];

      if (!source) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: "Card did not include an official source URL."
        });
        return null;
      }

      if (!allowedStatuses.has(status)) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: `Unsupported card status: ${status}`
        });
        return null;
      }

      if (unsupportedValues.length > 0) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: "Card contains exact values that were not found in the source text.",
          value: unsupportedValues.join(", ")
        });
        return null;
      }

      return {
        ...card,
        agendaItem: card.agendaItem.trim(),
        whatIsHappening: card.whatIsHappening.trim(),
        whyItMatters: card.whyItMatters.trim(),
        whoItAffects: card.whoItAffects.map((item) => item.trim()).filter(Boolean),
        categoryTags: card.categoryTags
          .map((tag) => tag.trim())
          .filter((tag) => allowedCategories.has(tag)),
        commentWindow: {
          ...commentWindow,
          closes: commentDeadline?.value || commentWindow.closes
        },
        howToAct,
        source,
        status,
        confidence: capConfidence(card.confidence, maxConfidence)
      };
    })
    .filter((card): card is NonNullable<typeof card> => Boolean(card))
    .filter(
      (card) =>
        card.source &&
        card.whatIsHappening &&
        card.agendaItem &&
        card.whyItMatters &&
        card.categoryTags.length > 0
    );
  const seenCards = new Set<string>();
  const dedupedCards = cards.filter((card) => {
    const key = cardDedupeKey(card);
    if (seenCards.has(key)) {
      options.onIssue?.({
        agendaItem: card.agendaItem,
        reason: "Duplicate card for the same agenda item and source was dropped."
      });
      return false;
    }

    seenCards.add(key);
    return true;
  });

  return {
    meetingSummary: parsed.meetingSummary,
    cards: dedupedCards
  };
}

export function parseAndValidateSummary(
  rawContent: string,
  validationOptions?: string | SummaryValidationOptions
) {
  const parsed = parsePossiblyWrappedJson(rawContent);
  return validateSimpleCitySummary(parsed, validationOptions);
}
