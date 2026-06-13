const MISSING_VALUE_PATTERN =
  /not listed|not applicable|not provided|n\/a|^na$|^none$|^null$|^tbd$|to be determined|^closed$|comments?\s+(?:are\s+)?(?:closed|not accepted|unavailable)|no comments?\s+(?:accepted|allowed)/i;

const DEADLINE_SIGNAL_PATTERN =
  /\b(by|before|deadline|due|no later than|until|through|prior to)\b/i;

const MONTH_DATE_PATTERN =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/i;

const NUMERIC_DATE_PATTERN = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;

const TIME_PATTERN = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/i;

export type CommentDeadlineInfo = {
  value: string;
  source: "explicit" | "action";
};

export function isListedText(value?: string | null) {
  const normalized = String(value || "").trim();
  return Boolean(normalized && !MISSING_VALUE_PATTERN.test(normalized));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractDeadlineDate(text: string) {
  const normalized = normalizeWhitespace(text);
  if (!DEADLINE_SIGNAL_PATTERN.test(normalized)) return null;

  const dateMatch = normalized.match(MONTH_DATE_PATTERN) || normalized.match(NUMERIC_DATE_PATTERN);
  if (!dateMatch || dateMatch.index === undefined) return null;

  const dateText = dateMatch[0];
  const beforeDate = normalized.slice(Math.max(0, dateMatch.index - 48), dateMatch.index);
  const timeBeforeDate = beforeDate.match(
    new RegExp(`(${TIME_PATTERN.source})\\s*(?:on\\s*)?$`, "i")
  );

  if (timeBeforeDate) return `${timeBeforeDate[1]} on ${dateText}`;

  const afterDate = normalized.slice(dateMatch.index + dateText.length, dateMatch.index + dateText.length + 48);
  const timeAfterDate = afterDate.match(new RegExp(`^(?:\\s*(?:at|by|before)\\s*)(${TIME_PATTERN.source})`, "i"));

  if (timeAfterDate) return `${dateText} at ${timeAfterDate[1]}`;

  return dateText;
}

export function getCommentDeadlineInfo({
  closes,
  actionTexts = []
}: {
  closes?: string | null;
  actionTexts?: Array<string | null | undefined>;
}): CommentDeadlineInfo | null {
  if (isListedText(closes)) {
    return {
      value: normalizeWhitespace(String(closes)),
      source: "explicit"
    };
  }

  for (const actionText of actionTexts) {
    if (!isListedText(actionText)) continue;

    const inferred = extractDeadlineDate(String(actionText));
    if (inferred) {
      return {
        value: inferred,
        source: "action"
      };
    }
  }

  return null;
}

export function hasCommentOptionInfo({
  closes,
  actionTexts = []
}: {
  closes?: string | null;
  actionTexts?: Array<string | null | undefined>;
}) {
  return Boolean(getCommentDeadlineInfo({ closes, actionTexts })) || actionTexts.some(isListedText);
}
