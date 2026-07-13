import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import { CATEGORIES } from "@/lib/constants";
import { CARD_STATUSES } from "@/lib/cardStatus";
import type { LlmReadyMeeting, MeetingStatus, SimpleCityCardTranslation, SimpleCitySummary } from "@/lib/types";
import { getCommentDeadlineInfo } from "@/lib/utils/commentDeadline";
import { areLikelySameAgendaItem } from "@/lib/utils/agendaItemIdentity";

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
  /\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand|m|bn|k))?/gi,
  /\b\d+(?:\.\d+)?\s?%/gi,
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi,
  /\b(?:agenda\s+item|item|resolution|ordinance)\s+(?:no\.?\s*)?[A-Z]?\d[\w.-]*/gi,
  /\b\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand)(?:\s*(?:units?|homes?|acres?|feet|ft|sq\.?\s*ft|square\s+feet|days?|months?|years?|hours?))?|\s*(?:units?|homes?|acres?|feet|ft|sq\.?\s*ft|square\s+feet|days?|months?|years?|hours?|percent))\b/gi
];
const NUMERIC_VALUE_PATTERN =
  /\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand|m|bn|k))?(?:\s*%|\s*(?:units?|homes?|acres?|feet|ft|sq\.?\s*ft|square\s+feet|days?|months?|years?|hours?|percent))?/gi;
const NUMERIC_SCALE: Record<string, number> = {
  thousand: 1_000,
  k: 1_000,
  million: 1_000_000,
  m: 1_000_000,
  billion: 1_000_000_000,
  bn: 1_000_000_000
};

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

const CardTranslationSchema = z.object({
  agendaItem: z.string().default(""),
  whatIsHappening: z.string().default(""),
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
};

export type SummaryValidationOptions = {
  fallbackSource?: string;
  allowedSourceUrls?: string[];
  sourceText?: string;
  maxConfidence?: "high" | "medium" | "low";
  meetingStatus?: MeetingStatus;
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
  unit: string | null;
};

function normalizeNumericUnit(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  if (/^units?$/.test(normalized)) return "unit";
  if (/^homes?$/.test(normalized)) return "home";
  if (normalized === "feet" || normalized === "ft") return "foot";
  if (normalized === "sq ft" || normalized === "square feet") return "square-foot";
  if (/^days?$/.test(normalized)) return "day";
  if (/^months?$/.test(normalized)) return "month";
  if (/^years?$/.test(normalized)) return "year";
  if (/^hours?$/.test(normalized)) return "hour";
  if (/^acres?$/.test(normalized)) return "acre";
  return null;
}

function parseComparableNumericValue(value: string): ComparableNumericValue | null {
  const match = value.trim().match(
    /^(\$)?\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(million|billion|thousand|m|bn|k))?(?:\s*(%|percent|units?|homes?|acres?|feet|ft|sq\.?\s*ft|square\s+feet|days?|months?|years?|hours?))?$/i
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
    kind: match[1] ? "currency" : isPercent ? "percent" : "number",
    unit: isPercent ? null : normalizeNumericUnit(suffix)
  };
}

function hasEquivalentNumericValue(value: string, sourceText: string) {
  const expected = parseComparableNumericValue(value);
  if (!expected) return false;

  NUMERIC_VALUE_PATTERN.lastIndex = 0;
  for (const match of sourceText.matchAll(NUMERIC_VALUE_PATTERN)) {
    const candidate = parseComparableNumericValue(match[0]);
    if (!candidate || candidate.kind !== expected.kind || candidate.unit !== expected.unit) continue;
    if (Math.abs(candidate.amount - expected.amount) <= Math.max(1, Math.abs(expected.amount)) * 1e-12) {
      return true;
    }
  }

  return false;
}

function isGroundedValue(value: string, sourceText: string) {
  const normalizedValue = normalizeEvidenceText(value);
  if (!normalizedValue) return true;
  if (normalizeEvidenceText(sourceText).includes(normalizedValue)) return true;
  return hasEquivalentNumericValue(value, sourceText);
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

function cleanCardTranslation(
  translation: z.infer<typeof CardTranslationSchema> | null | undefined,
  sourceStatus: string
): SimpleCityCardTranslation | null {
  if (!translation) return null;

  const agendaItem = translation.agendaItem.trim();
  const whatIsHappening = translation.whatIsHappening.trim();
  const whyItMatters = translation.whyItMatters.trim();

  if (!agendaItem || !whatIsHappening || !whyItMatters) return null;

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
    meetingStatus: meeting.status,
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

      if (
        options.meetingStatus === "Upcoming" &&
        (status === "Passed" || status === "Tabled")
      ) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: `Upcoming meeting card cannot use historical outcome status: ${status}`
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

      const agendaItem = card.agendaItem.trim();
      const whatIsHappening = card.whatIsHappening.trim();
      const whyItMatters = card.whyItMatters.trim();
      const categoryTags = card.categoryTags
        .map((tag) => tag.trim())
        .filter((tag) => allowedCategories.has(tag))
        .filter((tag, tagIndex, tags) => tags.indexOf(tag) === tagIndex)
        .slice(0, 2);

      if (!agendaItem || !whatIsHappening || !whyItMatters) {
        options.onIssue?.({
          agendaItem: card.agendaItem,
          reason: "Card was missing required summary text."
        });
        return null;
      }

      if (categoryTags.length === 0) {
        options.onIssue?.({
          agendaItem,
          reason: "Card did not include a supported category tag."
        });
        return null;
      }

      return {
        card: {
          ...card,
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
        spanishTranslation: cleanCardTranslation(spanishCardTranslations[index], status)
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
        reason: "Duplicate card for the same agenda item and source was dropped."
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
