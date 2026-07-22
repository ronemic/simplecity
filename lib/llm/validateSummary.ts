import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import { CATEGORIES } from "@/lib/constants";
import { CARD_STATUSES } from "@/lib/cardStatus";
import type { LlmReadyMeeting, MeetingStatus, SimpleCityCardTranslation, SimpleCitySummary } from "@/lib/types";
import { getCommentDeadlineInfo } from "@/lib/utils/commentDeadline";
import { areLikelySameAgendaItem } from "@/lib/utils/agendaItemIdentity";
import { uniqueSourceItemIds } from "@/lib/utils/sourceItemIdentity";
import {
  extractMeetingWideParticipationContext,
  findAgendaItemForCard
} from "@/lib/scraper/agendaItemContext";

const allowedCategories = new Set<string>(CATEGORIES);
const allowedStatuses = new Set<string>(CARD_STATUSES);
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
  /\b\d{1,4}:\d{2}-[A-Z]{1,6}-\d{3,}(?:-[A-Z]+)?\b/gi,
  /\b\d{1,6}\s+(?:[A-Z0-9.'-]+\s+){1,6}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl)\b/gi,
  /\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand|m|bn|k))?/gi,
  /\b\d+(?:\.\d+)?\s?%/gi,
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi,
  /\b(?:agenda\s+item|item|resolution|ordinance)\s+(?:no\.?\s*)?[A-Z]?\d[\w.-]*/gi,
  /\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand|m|bn|k))?(?:\s*(?:%|percent))?/gi
];
const NUMERIC_VALUE_PATTERN =
  /\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand|m|bn|k))?(?:\s*(?:%|percent))?/gi;
const DATE_VALUE_PATTERN =
  /\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})\b/gi;
const NUMERIC_SCALE: Record<string, number> = {
  thousand: 1_000,
  k: 1_000,
  million: 1_000_000,
  m: 1_000_000,
  billion: 1_000_000_000,
  bn: 1_000_000_000
};
const REPEATED_PUNCTUATION_PATTERN = /([^\p{L}\p{N}\s])(?:\s*\1){5,}/u;

const CardSchema = z.object({
  sourceItemId: z.string().trim().min(1).nullable().default(null),
  agendaItem: z.string().min(1),
  whatIsHappening: z.array(z.string().trim().min(1)).min(1).max(3),
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

const CardTranslationSchema = z.object({
  agendaItem: z.string().default(""),
  whatIsHappening: z.array(z.string().trim().min(1)).max(3).default([]),
  whyItMatters: z.string().default(""),
  whoItAffects: z.array(z.string()).default([]),
  status: z.string().default(""),
  commentWindow: z
    .object({
      opens: z.string().default("No indicado en el documento fuente."),
      closes: z.string().default("No indicado en el documento fuente.")
    })
    .default({
      opens: "No indicado en el documento fuente.",
      closes: "No indicado en el documento fuente."
    }),
  howToAct: z
    .object({
      attend: z.string().default("No indicado en el documento fuente."),
      email: z.string().default("No indicado en el documento fuente."),
      submitComment: z.string().default("No indicado en el documento fuente.")
    })
    .default({
      attend: "No indicado en el documento fuente.",
      email: "No indicado en el documento fuente.",
      submitComment: "No indicado en el documento fuente."
    })
});

const SummarySchema = z.object({
  meetingSummary: z.object({
    title: z.string().default(""),
    date: z.string().default(""),
    status: z.string().default(""),
    oneSentenceSummary: z.string().default("")
  }),
  cards: z.array(CardSchema).default([]),
  translations: z
    .object({
      es: z
        .object({
          meeting: z
            .object({
              title: z.string().default(""),
              meetingType: z.string().default("")
            })
            .optional(),
          cards: z.array(CardTranslationSchema.nullable()).default([])
        })
        .optional()
    })
    .optional()
});

export type SummaryValidationIssue = {
  agendaItem?: string;
  reason: string;
  value?: string;
  cardIndex?: number;
  repairable?: boolean;
  outcome?: "warning" | "reject";
};

export type SummaryValidationOptions = {
  fallbackSource?: string;
  allowedSourceUrls?: string[];
  sourceText?: string;
  maxConfidence?: "high" | "medium" | "low";
  meetingStatus?: MeetingStatus;
  allowedSourceItemIds?: string[];
  sourceTextForCard?: (sourceItemId: string | null, agendaItem: string) => string | null;
  meetingWideParticipationText?: string;
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

function hasRepeatedTokenSequence(value: string) {
  const tokens = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

  for (let sequenceLength = 1; sequenceLength <= 4; sequenceLength += 1) {
    const minimumRepeats = sequenceLength === 1 ? 6 : 4;
    for (
      let start = 0;
      start + sequenceLength * minimumRepeats <= tokens.length;
      start += 1
    ) {
      const sequence = tokens.slice(start, start + sequenceLength).join(" ");
      let repeats = 1;
      while (
        start + sequenceLength * (repeats + 1) <= tokens.length &&
        tokens
          .slice(start + sequenceLength * repeats, start + sequenceLength * (repeats + 1))
          .join(" ") === sequence
      ) {
        repeats += 1;
      }
      if (repeats >= minimumRepeats) return true;
    }
  }

  return false;
}

function hasLikelyGeneratedTextCorruption(value: string) {
  return (
    /[{}]/.test(value) ||
    REPEATED_PUNCTUATION_PATTERN.test(value) ||
    hasRepeatedTokenSequence(value)
  );
}

function findCorruptedGeneratedField(fields: Array<[label: string, value: string]>) {
  return fields.find(([, value]) => hasLikelyGeneratedTextCorruption(value))?.[0] || null;
}

function findCardTextCorruption(card: z.infer<typeof CardSchema>) {
  return findCorruptedGeneratedField([
    ["agenda item", card.agendaItem],
    ...card.whatIsHappening.map(
      (point, index) => [`what-is-happening point ${index + 1}`, point] as [string, string]
    ),
    ["why-it-matters text", card.whyItMatters],
    ...card.whoItAffects.map(
      (audience, index) => [`who-it-affects value ${index + 1}`, audience] as [string, string]
    ),
    ["comment-window opening", card.commentWindow.opens],
    ["comment-window closing", card.commentWindow.closes],
    ["attendance instructions", card.howToAct.attend],
    ["email instructions", card.howToAct.email],
    ["comment-submission instructions", card.howToAct.submitComment]
  ]);
}

function findTranslationTextCorruption(
  translation: z.infer<typeof CardTranslationSchema> | null | undefined
) {
  if (!translation) return null;

  return findCorruptedGeneratedField([
    ["translated agenda item", translation.agendaItem],
    ...translation.whatIsHappening.map(
      (point, index) => [`translated what-is-happening point ${index + 1}`, point] as [string, string]
    ),
    ["translated why-it-matters text", translation.whyItMatters],
    ...translation.whoItAffects.map(
      (audience, index) => [`translated who-it-affects value ${index + 1}`, audience] as [string, string]
    ),
    ["translated comment-window opening", translation.commentWindow.opens],
    ["translated comment-window closing", translation.commentWindow.closes],
    ["translated attendance instructions", translation.howToAct.attend],
    ["translated email instructions", translation.howToAct.email],
    ["translated comment-submission instructions", translation.howToAct.submitComment]
  ]);
}

function extractGroundableValues(text: string) {
  const matches: Array<{ value: string; start: number; end: number }> = [];

  for (const pattern of GROUNDABLE_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      matches.push({ value: match[0], start, end: start + match[0].length });
    }
  }

  return uniqueValues(
    matches
      .filter(
        (match) =>
          !matches.some(
            (other) =>
              other !== match &&
              other.start <= match.start &&
              other.end >= match.end &&
              other.value.length > match.value.length
          )
      )
      .map((match) => match.value)
  );
}

type ComparableNumericValue = {
  amount: number;
  kind: "currency" | "percent" | "number";
};

function parseComparableNumericValue(value: string): ComparableNumericValue | null {
  const match = value.trim().match(
    /^(\$)?\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(million|billion|thousand|m|bn|k))?(?:\s*(%|percent))?$/i
  );
  if (!match) return null;

  const base = Number(match[2].replace(/,/g, ""));
  const scale = match[3]?.toLowerCase();
  const amount = base * (scale ? NUMERIC_SCALE[scale] : 1);
  if (!Number.isFinite(amount)) return null;

  const suffix = match[4]?.toLowerCase() || "";
  const isPercent = suffix === "%" || suffix === "percent";
  return {
    amount,
    kind: match[1] ? "currency" : isPercent ? "percent" : "number"
  };
}

function hasEquivalentNumericValue(value: string, sourceText: string) {
  const expected = parseComparableNumericValue(value);
  if (!expected) return false;

  NUMERIC_VALUE_PATTERN.lastIndex = 0;
  for (const match of sourceText.matchAll(NUMERIC_VALUE_PATTERN)) {
    const candidate = parseComparableNumericValue(match[0]);
    if (!candidate || candidate.kind !== expected.kind) continue;
    if (Math.abs(candidate.amount - expected.amount) <= Math.max(1, Math.abs(expected.amount)) * 1e-12) {
      return true;
    }
  }

  return false;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

function parseComparableDateValue(value: string) {
  const normalized = value.trim();
  const namedMatch = normalized.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  const numericMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!namedMatch && !numericMatch) return null;

  const month = namedMatch
    ? MONTH_INDEX[namedMatch[1].toLowerCase()]
    : Number(numericMatch?.[1]);
  const day = Number(namedMatch?.[2] || numericMatch?.[2]);
  const year = Number(namedMatch?.[3] || numericMatch?.[3]);
  if (!month || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function hasEquivalentDateValue(value: string, sourceText: string) {
  const expected = parseComparableDateValue(value);
  if (!expected) return false;

  DATE_VALUE_PATTERN.lastIndex = 0;
  return Array.from(sourceText.matchAll(DATE_VALUE_PATTERN)).some(
    (match) => parseComparableDateValue(match[0]) === expected
  );
}

function isGroundedValue(value: string, sourceText: string) {
  const normalizedValue = normalizeEvidenceText(value);
  if (!normalizedValue) return true;
  if (normalizeEvidenceText(sourceText).includes(normalizedValue)) return true;
  return (
    hasEquivalentNumericValue(value, sourceText) ||
    hasEquivalentDateValue(value, sourceText)
  );
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

function cardItemGroundingText(card: z.infer<typeof CardSchema>) {
  return [
    card.agendaItem,
    ...card.whatIsHappening,
    card.whyItMatters,
    card.status
  ].filter(Boolean).join(" ");
}

function cardParticipationGroundingText(card: z.infer<typeof CardSchema>) {
  return [
    card.commentWindow.opens,
    card.commentWindow.closes,
    card.howToAct.attend,
    card.howToAct.email,
    card.howToAct.submitComment
  ]
    .filter((value) => value && value !== MISSING_SOURCE_VALUE)
    .join(" ");
}

function cleanCardTranslation(
  translation: z.infer<typeof CardTranslationSchema> | null | undefined,
  sourceStatus: string,
  expectedPointCount: number
): SimpleCityCardTranslation | null {
  if (!translation) return null;

  const agendaItem = translation.agendaItem.trim();
  const whatIsHappening = translation.whatIsHappening.map((point) => point.trim()).filter(Boolean);
  const whyItMatters = translation.whyItMatters.trim();

  if (
    !agendaItem ||
    whatIsHappening.length !== expectedPointCount ||
    !whyItMatters
  ) return null;

  return {
    agendaItem,
    whatIsHappening,
    whyItMatters,
    whoItAffects: translation.whoItAffects.map((item) => item.trim()).filter(Boolean),
    status: sourceStatus,
    commentWindow: {
      opens: translation.commentWindow.opens.trim(),
      closes: translation.commentWindow.closes.trim()
    },
    howToAct: {
      attend: translation.howToAct.attend.trim(),
      email: translation.howToAct.email.trim(),
      submitComment: translation.howToAct.submitComment.trim()
    }
  };
}

function buildMeetingMetadataText(meeting: LlmReadyMeeting) {
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
    meeting.publicCommentsInputText,
    ...meeting.documents.flatMap((doc) => [doc.url, doc.label])
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMeetingSourceText(meeting: LlmReadyMeeting) {
  return [buildMeetingMetadataText(meeting), meeting.llmInputText]
    .filter(Boolean)
    .join("\n");
}

function buildAgendaItemSourceText(item: NonNullable<LlmReadyMeeting["items"]>[number]) {
  return [
    item.externalId,
    item.fileNumber,
    item.agendaNumber,
    item.itemType,
    item.title,
    item.action,
    item.result,
    item.rowText,
    item.status,
    item.recommendedAction,
    item.legislationText,
    item.sourceUrl,
    ...(item.attachments || []).flatMap((attachment) => [
      attachment.label,
      attachment.url,
      attachment.extractedText
    ])
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
  const items = meeting.items || [];
  const uniqueIds = uniqueSourceItemIds(items);
  const meetingMetadataText = buildMeetingMetadataText(meeting);
  const meetingWideParticipationText = extractMeetingWideParticipationContext(
    meeting.llmInputText
  );
  return {
    fallbackSource: meeting.sourceUrl || "",
    allowedSourceUrls: [
      meeting.sourceUrl,
      meeting.source,
      meeting.meetingDetailsUrl,
      ...meeting.documents.map((doc) => doc.url)
    ].filter((url): url is string => Boolean(url)),
    sourceText: buildMeetingSourceText(meeting),
    meetingWideParticipationText,
    maxConfidence: maxConfidenceForMeeting(meeting),
    meetingStatus: meeting.status,
    allowedSourceItemIds: Array.from(uniqueIds),
    sourceTextForCard: (sourceItemId, agendaItem) => {
      const exactItem = sourceItemId && uniqueIds.has(sourceItemId)
        ? items.find((item) => item.externalId === sourceItemId)
        : null;
      const matchedItem = exactItem || findAgendaItemForCard(agendaItem, items);
      return matchedItem
        ? [meetingMetadataText, buildAgendaItemSourceText(matchedItem)].join("\n")
        : null;
    },
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

  const spanishMeeting = parsed.translations?.es?.meeting;
  const spanishCardTranslations = parsed.translations?.es?.cards || [];

  const cards = parsed.cards
    .map((card, index) => {
      const corruptedField = findCardTextCorruption(card);
      if (corruptedField) {
        options.onIssue?.({
          agendaItem: card.agendaItem.slice(0, 120),
          reason: `Card contained malformed generated text in its ${corruptedField}.`,
          cardIndex: index,
          repairable: true,
          outcome: "reject"
        });
        return null;
      }

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
      const sourceItemId = card.sourceItemId?.trim() || null;
      const groundingSourceText =
        options.sourceTextForCard?.(sourceItemId, card.agendaItem) || sourceText;
      const itemUnsupportedValues = groundingSourceText
        ? extractGroundableValues(cardItemGroundingText(card)).filter(
            (value) => !isGroundedValue(value, groundingSourceText)
          )
        : [];
      const participationGroundingSource = [
        groundingSourceText,
        options.meetingWideParticipationText
      ].filter(Boolean).join("\n");
      const participationUnsupportedValues = participationGroundingSource
        ? extractGroundableValues(cardParticipationGroundingText(card)).filter(
            (value) => !isGroundedValue(value, participationGroundingSource)
          )
        : [];
      const unsupportedValues = uniqueValues([
        ...itemUnsupportedValues,
        ...participationUnsupportedValues
      ]);

      if (!source) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: "Card did not include an official source URL.",
          cardIndex: index,
          repairable: true,
          outcome: "reject"
        });
        return null;
      }

      if (
        sourceItemId &&
        !(options.allowedSourceItemIds || []).includes(sourceItemId)
      ) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: "Card returned an unknown source item ID.",
          value: sourceItemId,
          cardIndex: index,
          repairable: true,
          outcome: "reject"
        });
        return null;
      }

      if (!allowedStatuses.has(status)) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: `Unsupported card status: ${status}`,
          cardIndex: index,
          repairable: true,
          outcome: "reject"
        });
        return null;
      }

      if (
        options.meetingStatus === "Upcoming" &&
        (status === "Passed" || status === "Tabled")
      ) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: `Upcoming meeting card cannot use historical outcome status: ${status}`,
          cardIndex: index,
          repairable: true,
          outcome: "reject"
        });
        return null;
      }

      if (unsupportedValues.length > 0) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: "Card contains exact values that were not found in the source text.",
          value: unsupportedValues.join(", "),
          cardIndex: index,
          repairable: true,
          outcome: "reject"
        });
        return null;
      }

      const agendaItem = card.agendaItem.trim();
      const whatIsHappening = card.whatIsHappening.map((point) => point.trim()).filter(Boolean);
      const whyItMatters = card.whyItMatters.trim();
      const normalizedSummaryPoints = whatIsHappening.map((point) => point.toLowerCase());
      const categoryTags = card.categoryTags
        .map((tag) => tag.trim())
        .filter((tag) => allowedCategories.has(tag))
        .filter((tag, tagIndex, tags) => tags.indexOf(tag) === tagIndex)
        .slice(0, 2);

      if (!agendaItem || whatIsHappening.length === 0 || !whyItMatters) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: "Card was missing required summary text.",
          cardIndex: index,
          repairable: true,
          outcome: "reject"
        });
        return null;
      }

      if (new Set(normalizedSummaryPoints).size !== normalizedSummaryPoints.length) {
        options.onIssue?.({
          agendaItem,
          reason: "Card included duplicate what-is-happening points.",
          cardIndex: index,
          repairable: true,
          outcome: "reject"
        });
        return null;
      }

      if (categoryTags.length === 0) {
        options.onIssue?.({
          agendaItem,
          reason: "Card did not include a supported category tag.",
          cardIndex: index,
          repairable: true,
          outcome: "reject"
        });
        return null;
      }

      const spanishTranslation = spanishCardTranslations[index];
      const corruptedTranslationField = findTranslationTextCorruption(spanishTranslation);
      if (corruptedTranslationField) {
        options.onIssue?.({
          agendaItem,
          reason: `Card contained malformed generated text in its ${corruptedTranslationField}.`,
          outcome: "warning"
        });
      }

      return {
        card: {
          ...card,
          sourceItemId,
          agendaItem,
          whatIsHappening,
          whyItMatters,
          whoItAffects: card.whoItAffects.map((item) => item.trim()).filter(Boolean),
          categoryTags,
          commentWindow: {
            ...commentWindow,
            closes: commentDeadline?.value || commentWindow.closes
          },
          howToAct,
          source,
          status,
          confidence: capConfidence(card.confidence, maxConfidence)
        },
        spanishTranslation: corruptedTranslationField
          ? null
          : cleanCardTranslation(spanishTranslation, status, whatIsHappening.length)
      };
    })
    .filter((card): card is NonNullable<typeof card> => Boolean(card));
  const seenCards: SimpleCitySummary["cards"] = [];
  const dedupedCards = cards.filter((card) => {
    const duplicate = seenCards.some(
      (seen) =>
        normalizeUrl(seen.source) === normalizeUrl(card.card.source) &&
        areLikelySameAgendaItem(seen.agendaItem, card.card.agendaItem)
    );
    if (duplicate) {
      options.onIssue?.({
        agendaItem: card.card.agendaItem,
        reason: "Duplicate card for the same agenda item and source was dropped.",
        outcome: "reject"
      });
      return false;
    }

    seenCards.push(card.card);
    return true;
  });

  return {
    meetingSummary: parsed.meetingSummary,
    cards: dedupedCards.map((entry) => entry.card),
    translations: parsed.translations?.es
      ? {
          es: {
            meeting: spanishMeeting
              ? {
                  title: spanishMeeting.title.trim(),
                  meetingType: spanishMeeting.meetingType.trim()
                }
              : undefined,
            cards: dedupedCards.map((entry) => entry.spanishTranslation)
          }
        }
      : undefined
  };
}

export function parseAndValidateSummary(
  rawContent: string,
  validationOptions?: string | SummaryValidationOptions
) {
  const parsed = parsePossiblyWrappedJson(rawContent);
  return validateSimpleCitySummary(parsed, validationOptions);
}
