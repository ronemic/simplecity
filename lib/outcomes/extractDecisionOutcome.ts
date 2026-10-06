import crypto from "node:crypto";
import type {
  AgendaItem,
  DecisionOutcomeKind,
  LlmReadyMeeting,
  PrimeGovDocument,
  SummaryCardRow
} from "@/lib/types";
import { extractAgendaItemsFromText } from "@/lib/scraper/agendaItemContext";
import { hasUsableOfficialDocumentText } from "@/lib/scraper/documentUsability";
import { normalizeSourceText } from "@/lib/scraper/prepareLlmInput";
import { cleanText } from "@/lib/utils/slug";
import {
  agendaItemIdentityTokens,
  agendaItemSimilarity
} from "@/lib/utils/agendaItemIdentity";
import { parseMeetingDate } from "@/lib/utils/date";
import { KNOWN_JURISDICTION_SLUGS } from "@/lib/config/jurisdictions";
import { uniqueSourceItemIds } from "@/lib/utils/sourceItemIdentity";

export const DECISION_OUTCOME_JURISDICTIONS = new Set<string>(KNOWN_JURISDICTION_SLUGS);

/**
 * Menlo Park and Los Altos Hills minutes report votes as "…; passes 6-0" or
 * "Motion passes 5 out of 5". Bare "passes" is also a noun ("transportation
 * passes for"), so it counts only before the tally. Without a tally the motion's
 * subject can sit in another sentence ("voted not to accept the fee schedule…
 * The motion passes"), where "Passed" would mislead.
 */
const VOTE_PASSES_TERM = "passes(?=\\s+\\d)";
const OUTCOME_TERMS =
  `approved|adopted|pass(?:ed)?|${VOTE_PASSES_TERM}|carried|accepted|authorized|confirmed|denied|rejected|fail(?:ed)?|defeated|continued|postponed|tabled|deferred|referred|amended|determined|reported|directed|provided direction|gave direction|received and filed|introduced and waived(?: the)? reading|no action(?: taken)?`;
const OUTCOME_TERM_PATTERN = new RegExp(`\\b(?:${OUTCOME_TERMS})\\b`, "i");
const APPROVAL_TERMS = `approved|adopted|pass(?:ed)?|${VOTE_PASSES_TERM}|carried|accepted|authorized|confirmed`;
const APPROVAL_TERM_PATTERN = new RegExp(`\\b(?:${APPROVAL_TERMS})\\b`, "i");
const FAILURE_TERM_PATTERN = /\b(?:denied|rejected|fail(?:ed)?|defeated)\b/i;
/**
 * Bare "no" is deliberately excluded: official records use "no action taken" as
 * a real outcome, and treating it as a negator would erase it.
 */
const NEGATOR = "(?:\\bnot\\b|\\bnever\\b|\\bnor\\b|n['’]t\\b)";
const NEGATED_LINKING_VERB = "(?:\\s+(?:be|been|being|yet))?";
const NEGATED_OUTCOME_TERM_PATTERN = new RegExp(
  `${NEGATOR}${NEGATED_LINKING_VERB}\\s+(?:${OUTCOME_TERMS})\\b`,
  "gi"
);
const NEGATED_APPROVAL_PATTERN = new RegExp(
  `${NEGATOR}${NEGATED_LINKING_VERB}\\s+(?:${APPROVAL_TERMS})\\b`,
  "i"
);
/**
 * A platform "Pass" flag only reports that the recorded motion succeeded. When
 * the action itself removed the item from consideration or undid an earlier
 * vote, the item was not approved, so these patterns take precedence over the
 * flag.
 *
 * All three are anchored to procedural phrasing on purpose: an item may lawfully
 * approve a withdrawal of funds or adopt an ordinance rescinding a resolution,
 * and those are ordinary approvals that must keep their normal classification.
 */
const WITHDRAWN_FROM_AGENDA_PATTERN =
  /^(?:item\s+)?withdrawn\b|\bwithdraw(?:n|al)\b[^.]{0,40}?\b(?:from\s+(?:the\s+)?(?:agenda|calendar|consideration)|by\s+(?:staff|the\s+applicant|the\s+petitioner|the\s+sponsor))\b/i;
const RESCINDED_VOTE_PATTERN =
  /\brescind(?:ed|ing|s)?\b[^.]{0,40}?\b(?:previous|prior|earlier)\b|\b(?:previous|prior|earlier)\s+(?:vote|motion|action)\b[^.]{0,40}?\brescind/i;
const RECONSIDERED_VOTE_PATTERN =
  /\b(?:motion|moved|move)\b[^.]{0,40}?\breconsider/i;
/**
 * San Francisco committees record "MEETING RECESSED" with a "Pass" flag when they
 * stop mid-agenda. The flag reports the recess; the item waits for the
 * reconvened meeting without a vote.
 */
const MEETING_RECESSED_PATTERN = /^\s*meeting\s+recessed\b/i;
/**
 * Minutes repeat a running header on every page ("Planning Commission Regular
 * Meeting Approved Minutes / June 8, 2026 / Page 4"). Its "Approved" describes the
 * document, so an item block that crosses a page break must not read it as a vote.
 */
const MINUTES_PAGE_HEADER_PATTERN = /^[^\n]{0,80}\bmeeting\s+approved\s+minutes\b[^\n]*$/gim;
/**
 * A motion to extend the meeting's end time is recorded wherever the clock ran
 * out, often inside the item under discussion. It is never that item's result.
 * Its "ACTION:" label goes with it, or the label would claim the next paragraph.
 */
const EXTEND_MEETING_MOTION_PATTERN =
  /(?:\b(?:action|result|decision)\s*[:\-]\s*)?\bmotion\b[^.;\n]{0,80}?\bto\s+extend\s+the\s+meeting\b[\s\S]{0,400}?\b(?:passe[sd]|carried|failed)\b[^.\n]*\.?/gi;
/**
 * Santa Clara County's minutes give every item the body acted on its own
 * "15 RESULT:" line, consent items included.
 */
const ITEM_RESULT_LINE_PATTERN = /^\s*\d{1,3}(?:\.[a-z0-9]+)?\s+RESULT\s*:/im;

const RESULT_PARAGRAPH_FRAGMENT = "(?:(?!\\n\\n)[\\s\\S])";
const RESULT_MARKER_PATTERN = new RegExp(
  `\\b(?:action|result|decision|motion)\\s*[:\\-]\\s*${RESULT_PARAGRAPH_FRAGMENT}{0,700}?(?:${OUTCOME_TERMS})${RESULT_PARAGRAPH_FRAGMENT}{0,350}`,
  "i"
);
const ITEM_RESULT_PATTERN = new RegExp(
  `(?:^|[.!?]\\s+)([^.!?]{0,220}\\b(?:item|motion|ordinance|resolution|application|contract|proposal|consent calendar)\\b[^.!?]{0,260}\\b(?:${OUTCOME_TERMS})\\b[^.!?]{0,260}[.!?]?)`,
  "i"
);
// "No. 2074" is part of the motion, not the end of its sentence.
const RESULT_SENTENCE_FRAGMENT = "(?:\\bNo\\.\\s*(?=\\d)|[^.])";
const CLEAR_RESULT_PATTERN = new RegExp(
  `\\b(?:motion|council|board|commission|committee|authority|supervisors?)\\b${RESULT_SENTENCE_FRAGMENT}{0,360}\\b(?:${OUTCOME_TERMS})\\b${RESULT_SENTENCE_FRAGMENT}{0,600}`,
  "i"
);
const STANDALONE_NO_ACTION_PATTERN =
  /(?:^|\n)\s*(no action(?: taken)?)[.!]?\s*(?=\n|$)/i;
const DIRECTION_RESULT_PATTERN =
  /\b(?:city\s+)?(?:council|board|commission|committee|authority|supervisors?)\s+(?:directed|provided direction|gave direction)\b[\s\S]{0,680}/i;
const MIN_FUZZY_MATCH_SCORE = 0.72;
const MIN_FUZZY_MATCH_MARGIN = 0.15;
const MIN_SHARED_IDENTITY_TOKENS = 3;
const DECISION_OUTCOME_EXPLANATION_FINGERPRINT_VERSION =
  "decision-outcome-explanation-v1";

export type DecisionOutcomeMatchMethod =
  | "source_item_id"
  | "source_url"
  | "agenda_number"
  | "title";

export type GuardedAgendaItemMatch = {
  item: AgendaItem;
  method: DecisionOutcomeMatchMethod;
  score: number;
  runnerUpScore: number | null;
};

export type DecisionOutcomeDraft = {
  kind: DecisionOutcomeKind;
  headline: string;
  summary: string;
  decidedAt: string | null;
  vote: string | null;
  nextStep: string | null;
  sourceUrl: string;
  sourceHash: string;
  sourceText: string;
  matchedItemKey: string;
  matchedAgendaNumber: string | null;
  matchMethod: DecisionOutcomeMatchMethod;
  matchScore: number;
  canonicalStatus: DecisionOutcomeCanonicalStatus;
  sourceContext: string;
};

export type DecisionOutcomeCanonicalStatus =
  | "approved"
  | "rejected"
  | "continued"
  | "amended"
  | "recommended"
  | "heard_and_filed"
  | "committee_action"
  | "direction"
  | "no_action"
  | "withdrawn"
  | "rescinded"
  | "reconsidered"
  | "recorded";

export type CanonicalDecisionOutcome = {
  kind: DecisionOutcomeKind;
  canonicalStatus: DecisionOutcomeCanonicalStatus;
  headline: string;
  nextStep: string | null;
};

function compactOutcomeText(value?: string | null) {
  const normalized = cleanText(String(value || ""))
    .replace(/===\s*PAGE\s+\d+\s*===/gi, " ")
    .replace(
      /City of Menlo Park\s+701 Laurel St\.,?\s+Menlo Park,?\s+CA\s+94025\s+tel\s+650-330-6600\s+www\.menlopark\.gov/gi,
      " "
    )
    .replace(/^(?:action|result|decision|motion)\s*[:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= 700) return normalized;
  const truncated = normalized.slice(0, 697);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace > 500 ? lastSpace : truncated.length)}...`;
}

function sentenceCase(value: string) {
  const normalized = compactOutcomeText(value).replace(/[.;:,]+$/, "");
  if (!normalized) return normalized;
  if (/^[A-Z0-9 &/\-]+$/.test(normalized)) {
    const lower = normalized.toLowerCase();
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

/**
 * The first "to <verb>" after the mover names what the motion does: "Romero
 * moved, seconded by Abrica, to reject the ordinance. Motion carried 3-2".
 */
const MOTION_PURPOSE_PATTERN = /\b(?:moved|motion)\b[^.;]{0,160}?\bto\s+([a-z]+)/;

export function classifyDecisionOutcome(value: string): DecisionOutcomeKind {
  // A quoted resolution title describes the subject being adopted. Words such
  // as "Second Amendment" or "Continued Participation" are not procedural
  // outcomes. Keep action language outside the title, including "as amended".
  const raw = value
    .replace(/“A Resolution\b[^”]*(?:”|$)|"A Resolution\b[^"]*(?:"|$)/gi, " ")
    .toLowerCase();
  // "The motion did not pass" must never read as a passage. Strip negated
  // outcome terms before matching so the surviving terms describe what the body
  // actually did, and remember a negated approval so it lands on rejection
  // rather than falling through to an unclassified outcome.
  const negatedApproval = NEGATED_APPROVAL_PATTERN.test(raw);
  const text = raw.replace(NEGATED_OUTCOME_TERM_PATTERN, " ");
  // "Carried" only says the motion passed. A passed motion to reject or deny
  // rejected the item, and a passed motion to continue it continued it.
  const purpose = text.match(MOTION_PURPOSE_PATTERN)?.[1];
  if (
    purpose &&
    !negatedApproval &&
    APPROVAL_TERM_PATTERN.test(text) &&
    !FAILURE_TERM_PATTERN.test(text)
  ) {
    if (/^(?:reject|deny)$/.test(purpose)) return "rejected";
    if (/^(?:continue|postpone|table|defer|refer)$/.test(purpose)) return "continued";
  }
  // An amendment that was denied is a rejection, not an amendment, so the
  // amendment branch must yield whenever the record also carries a failure.
  if (/\bamend(?:ed|ment|ments)?\b/.test(text) && !FAILURE_TERM_PATTERN.test(text)) {
    return "amended";
  }
  if (/\b(?:continued|postponed|tabled|deferred|referred)\b/.test(text)) return "continued";
  if (FAILURE_TERM_PATTERN.test(text) || negatedApproval) return "rejected";
  if (APPROVAL_TERM_PATTERN.test(text)) {
    return "approved";
  }
  return "other";
}

export function outcomeHeadline(kind: DecisionOutcomeKind, value: string) {
  const text = value.toLowerCase();
  const unanimous = /\bunanim(?:ous|ously|ity)\b/.test(text);
  const suffix = unanimous ? " unanimously" : "";

  if (kind === "amended") {
    return /\b(?:approved|adopted|pass(?:ed)?|carried)\b/.test(text)
      ? `Approved with amendments${suffix}`
      : "Amended";
  }
  if (kind === "continued") {
    if (/\bpostponed\b/.test(text)) return "Postponed";
    if (/\breferred\b/.test(text)) return "Referred";
    const continuedDate = value.match(
      /\bcontinued\s+to\s+([A-Z][a-z]+\s+\d{1,2})(?:,\s*\d{4})?/i
    );
    if (continuedDate) return `Continued to ${continuedDate[1]}`;
    return "Continued";
  }
  if (kind === "rejected") {
    if (/\bdenied\b/.test(text)) return "Denied";
    if (/\bfail(?:ed)?\b|\bdefeated\b/.test(text)) return "Motion failed";
    return "Rejected";
  }
  if (kind === "approved") {
    if (/\badopted\b/.test(text)) return `Adopted${suffix}`;
    if (/\bapproved\b|\bauthorized\b|\bconfirmed\b/.test(text)) {
      return `Approved${suffix}`;
    }
    return `Passed${suffix}`;
  }
  if (/\bno action(?: taken)?\b/.test(text)) return "No action taken";
  if (/\b(?:directed|provided direction|gave direction)\b/.test(text)) {
    return "Direction provided";
  }
  if (/\breceived and filed\b/.test(text)) return "Received and filed";
  if (/\bintroduced and waived(?: the)? reading\b/.test(text)) return "Introduced";
  return "Outcome recorded";
}

/**
 * Scanned minutes frequently omit sentence punctuation, so a roll call runs
 * straight into whatever follows it. Stopping at the next tally label or motion
 * verb keeps the next motion's prose out of the recorded vote.
 */
const ROLL_CALL_SEGMENT_BOUNDARY =
  /[.;]|\b(?:no(?:es)?|nay(?:s)?|absent|excused|abstain(?:ed|ing|tions?)?|recused|vacant|motion|moved|move|seconded?|enactment|resolution|ordinance|proclamation|session|closed|item|file|attachment)\b/i;

function rollCallSegment(text: string, label: RegExp) {
  const match = text.match(label);
  if (!match || match.index === undefined) return null;
  const rest = text.slice(match.index + match[0].length);
  const boundary = rest.search(ROLL_CALL_SEGMENT_BOUNDARY);
  let segment = cleanText(boundary >= 0 ? rest.slice(0, boundary) : rest)
    // Minutes glue the tally onto the last name ("and Canepa5 - No: 0"), so a
    // trailing separator is left behind once the boundary is applied.
    .replace(/[\s,;:\-–—]+$/, "");
  // A roll call that ends a line runs into the next numbered item ("Brandon
  // Stroy\n1. Minutes of ...") or an OCR'd table rule, which the "." boundary
  // leaves behind as a stray "1" or "|". Names never end that way.
  if (/[A-Za-z]/.test(segment)) segment = segment.replace(/\s+(?:\d{1,3}|\|)$/, "");
  return segment ? segment.slice(0, 160) : null;
}

export function extractVoteDetail(value: string) {
  const text = compactOutcomeText(value);
  const numericVote = text.match(/\b(\d{1,2})\s*[-–—]\s*(\d{1,2})(?:\s*[-–—]\s*(\d{1,2}))?\b/);
  if (numericVote) {
    return [numericVote[1], numericVote[2], numericVote[3]].filter(Boolean).join("–");
  }

  const ayes = rollCallSegment(text, /\b(?:ayes?|yes)\s*:\s*/i);
  if (ayes) {
    const noes = rollCallSegment(text, /\b(?:noes?|nays?|no)\s*:\s*/i);
    return `Ayes: ${ayes}; Noes: ${noes || "None"}`.slice(0, 260);
  }

  return /\bunanim(?:ous|ously|ity)\b/i.test(text) ? "Unanimous" : null;
}

export function extractNextStep(value: string, kind: DecisionOutcomeKind) {
  if (kind !== "continued") return null;
  const continued = compactOutcomeText(value).match(
    /\bcontinued\s+to\s+(.{1,120})$/i
  );
  if (!continued) return null;
  return `This item returns ${cleanText(continued[1]).replace(/[.;,]+$/, "")}.`;
}

function isCommitteeMeeting(meeting: Pick<LlmReadyMeeting, "title">) {
  return /\bcommittee\b/i.test(meeting.title);
}

function isSantaBarbaraPlanningCommission(
  meeting: Pick<LlmReadyMeeting, "jurisdictionSlug" | "title" | "meetingType">
) {
  return (
    meeting.jurisdictionSlug === "santa-barbara-county" &&
    /planning commission/i.test(`${meeting.meetingType} ${meeting.title}`)
  );
}

export function interpretOfficialAction(
  action: string | null | undefined,
  result: string | null | undefined,
  meeting: Pick<LlmReadyMeeting, "jurisdictionSlug" | "title" | "meetingType">
): CanonicalDecisionOutcome {
  const actionText = compactOutcomeText(action);
  const resultText = compactOutcomeText(result);
  const sourceText = [actionText, resultText].filter(Boolean).join(" | ");
  const lowerAction = actionText.toLowerCase();
  const lowerResult = resultText.toLowerCase();
  const lowerSource = sourceText.toLowerCase();
  const failed = /\b(?:fail(?:ed)?|denied|rejected|defeated)\b/.test(lowerSource);

  if (WITHDRAWN_FROM_AGENDA_PATTERN.test(sourceText)) {
    return {
      kind: "other",
      canonicalStatus: "withdrawn",
      headline: "Withdrawn from the agenda",
      nextStep: "The item was withdrawn, so the body did not act on it."
    };
  }

  if (RESCINDED_VOTE_PATTERN.test(sourceText)) {
    return {
      kind: "other",
      canonicalStatus: "rescinded",
      headline: "Previous vote rescinded",
      nextStep: "The earlier vote was undone, so the item may return for another vote."
    };
  }

  if (RECONSIDERED_VOTE_PATTERN.test(sourceText)) {
    return {
      kind: "other",
      canonicalStatus: "reconsidered",
      headline: "Previous vote reconsidered",
      nextStep: "The body reopened its earlier vote on this item."
    };
  }

  if (MEETING_RECESSED_PATTERN.test(actionText)) {
    return {
      kind: "continued",
      canonicalStatus: "continued",
      headline: "Meeting recessed",
      nextStep: "The meeting was recessed before a vote on this item."
    };
  }

  if (isSantaBarbaraPlanningCommission(meeting)) {
    const advisoryKind = classifyDecisionOutcome(sourceText);
    if (advisoryKind === "continued") {
      return {
        kind: "continued",
        canonicalStatus: "continued",
        headline: outcomeHeadline("continued", sourceText),
        nextStep: extractNextStep(sourceText, "continued")
      };
    }
    if (advisoryKind === "approved") {
      return {
        kind: "other",
        canonicalStatus: "recommended",
        headline: "Recommended approval",
        nextStep: "This is an advisory recommendation, not a final county decision."
      };
    }
    if (advisoryKind === "rejected") {
      return {
        kind: "other",
        canonicalStatus: "recommended",
        headline: "Recommended denial",
        nextStep: "This is an advisory recommendation, not a final county decision."
      };
    }
    if (advisoryKind === "amended") {
      return {
        kind: "other",
        canonicalStatus: "recommended",
        headline: "Recommendation amended",
        nextStep: "This is an advisory recommendation, not a final county decision."
      };
    }
    return {
      kind: "other",
      canonicalStatus: "recorded",
      headline: /\bno action(?: taken)?\b/.test(lowerSource)
        ? "No recommendation made"
        : "Advisory action recorded",
      nextStep: "This is an advisory action, not a final county decision."
    };
  }

  if (/\brecommend(?:ed|ation)?\b/.test(lowerAction)) {
    return {
      kind: "other",
      canonicalStatus: "recommended",
      headline: failed ? "Recommendation failed" : "Recommended for approval",
      nextStep: failed
        ? "The recommendation did not advance."
        : meeting.jurisdictionSlug === "san-francisco"
          ? "The item advances to the full Board of Supervisors for further action."
          : "The item advances to the next legislative body for further action."
    };
  }

  if (/\bheard\s+and\s+filed\b/.test(lowerAction)) {
    return {
      kind: "other",
      canonicalStatus: "heard_and_filed",
      headline: "Heard and filed",
      nextStep: null
    };
  }

  if (
    /\b(?:amend(?:ed|ment|ments)?|continued|postponed|tabled|deferred|referred)\b/.test(
      lowerSource
    ) &&
    /\b(?:fail(?:ed)?|denied|rejected|defeated)\b/.test(lowerResult)
  ) {
    return {
      kind: "rejected",
      canonicalStatus: "rejected",
      headline: outcomeHeadline("rejected", resultText),
      nextStep: null
    };
  }

  const kind = classifyDecisionOutcome(sourceText);
  if (isCommitteeMeeting(meeting) && /\bpass(?:ed)?\b/.test(lowerSource)) {
    if (kind === "amended") {
      return {
        kind: "amended",
        canonicalStatus: "amended",
        headline: "Amended in committee",
        nextStep:
          meeting.jurisdictionSlug === "san-francisco"
            ? "This was a committee action, not final approval by the Board of Supervisors."
            : "This was a committee action, not final approval by the next legislative body."
      };
    }
    if (kind === "approved") {
      return {
        kind: "other",
        canonicalStatus: "committee_action",
        headline: "Committee motion passed",
        nextStep:
          meeting.jurisdictionSlug === "san-francisco"
            ? "This was a committee action, not final approval by the Board of Supervisors."
            : "This was a committee action, not final approval by the next legislative body."
      };
    }
  }

  const canonicalStatus: DecisionOutcomeCanonicalStatus =
    kind === "other"
      ? /\bno action(?: taken)?\b/.test(lowerSource)
        ? "no_action"
        : /\b(?:directed|provided direction|gave direction)\b/.test(lowerSource)
          ? "direction"
          : "recorded"
      : kind;

  return {
    kind,
    canonicalStatus,
    headline: outcomeHeadline(kind, sourceText),
    nextStep: extractNextStep(sourceText, kind)
  };
}

export function extractResultText(value: string) {
  const text = normalizeSourceText(value)
    .replace(MINUTES_PAGE_HEADER_PATTERN, "")
    .replace(EXTEND_MEETING_MOTION_PATTERN, " ");
  if (!text || !OUTCOME_TERM_PATTERN.test(text)) return null;

  const candidate =
    text.match(RESULT_MARKER_PATTERN)?.[0] ||
    text.match(STANDALONE_NO_ACTION_PATTERN)?.[1] ||
    text.match(DIRECTION_RESULT_PATTERN)?.[0] ||
    text.match(CLEAR_RESULT_PATTERN)?.[0] ||
    text.match(ITEM_RESULT_PATTERN)?.[1] ||
    null;
  if (!candidate) return null;

  const result = compactOutcomeText(candidate);
  if (
    /\b(?:these|the)\s+(?:meeting\s+)?minutes\s+(?:were|are|have been)\s+approved\b/i.test(
      result
    )
  ) {
    return null;
  }
  return result;
}

function officialMinutesDocuments(meeting: LlmReadyMeeting) {
  return meeting.documents.filter(
    (document) =>
      ["Minutes", "Accessible Minutes"].includes(document.type) &&
      !document.isAgendaItemAttachment &&
      minutesLabelMatchesMeeting(document.label, meeting.dateText)
  );
}

function minutesLabelMatchesMeeting(
  label: string | null | undefined,
  meetingDateText: string | null | undefined
) {
  const labelDate = parseMeetingDate(String(label || ""));
  const meetingDate = parseMeetingDate(String(meetingDateText || ""));
  if (!labelDate || !meetingDate) return true;
  return labelDate.slice(0, 10) === meetingDate.slice(0, 10);
}

function minutesDocuments(meeting: LlmReadyMeeting) {
  return officialMinutesDocuments(meeting).filter((document) =>
    hasUsableOfficialDocumentText(document)
  );
}

function normalizedIdentifier(value?: string | null) {
  return cleanText(String(value || "")).toLowerCase();
}

function agendaItemHasSourceUrl(item: AgendaItem, sourceUrl: string) {
  return [
    item.sourceUrl,
    ...(item.attachments || []).map((document) => document.url)
  ].some((candidate) => String(candidate || "").trim() === sourceUrl);
}

function numericIdentityTokens(value: string) {
  return agendaItemIdentityTokens(value).filter((token) => /\d/.test(token));
}

function hasConflictingNumericIdentity(left: string, right: string) {
  const leftNumbers = numericIdentityTokens(left);
  const rightNumbers = numericIdentityTokens(right);
  if (leftNumbers.length === 0 || rightNumbers.length === 0) return false;
  return (
    leftNumbers.some((token) => !rightNumbers.includes(token)) ||
    rightNumbers.some((token) => !leftNumbers.includes(token))
  );
}

function sharedIdentityTokenCount(left: string, right: string) {
  const leftTokens = new Set(agendaItemIdentityTokens(left));
  const rightTokens = new Set(agendaItemIdentityTokens(right));
  return Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
}

export function findGuardedAgendaItemMatch(
  title: string,
  items: AgendaItem[] = [],
  options: {
    sourceUrl?: string | null;
    agendaNumber?: string | null;
    enforceNumericConsistency?: boolean;
  } = {}
): GuardedAgendaItemMatch | null {
  const normalizedTitle = cleanText(title);
  if (!normalizedTitle || items.length === 0) return null;

  const sourceUrl = String(options.sourceUrl || "").trim();
  if (sourceUrl) {
    const sourceMatches = items.filter(
      (item) => agendaItemHasSourceUrl(item, sourceUrl)
    );
    if (sourceMatches.length === 1) {
      return {
        item: sourceMatches[0],
        method: "source_url",
        score: 1,
        runnerUpScore: null
      };
    }
  }

  let candidates = items;
  const agendaNumber = normalizedIdentifier(options.agendaNumber);
  if (agendaNumber) {
    const numberedItems = items.filter((item) => normalizedIdentifier(item.agendaNumber));
    const agendaMatches = numberedItems.filter(
      (item) => normalizedIdentifier(item.agendaNumber) === agendaNumber
    );
    if (agendaMatches.length === 1) {
      return {
        item: agendaMatches[0],
        method: "agenda_number",
        score: 1,
        runnerUpScore: null
      };
    }
    if (agendaMatches.length > 1) {
      candidates = agendaMatches;
    } else if (numberedItems.length > 0) {
      return null;
    }
  }

  const enforceNumericConsistency = options.enforceNumericConsistency !== false;
  const ranked = candidates
    .flatMap((item) => {
      const candidate = cleanText(item.title || item.rowText);
      if (!candidate) return [];
      if (enforceNumericConsistency && hasConflictingNumericIdentity(normalizedTitle, candidate)) {
        return [];
      }
      const sharedTokens = sharedIdentityTokenCount(normalizedTitle, candidate);
      if (sharedTokens < MIN_SHARED_IDENTITY_TOKENS) return [];
      return [{ item, score: agendaItemSimilarity(normalizedTitle, candidate) }];
    })
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best || best.score < MIN_FUZZY_MATCH_SCORE) return null;
  const runnerUpScore = ranked[1]?.score ?? null;
  if (
    runnerUpScore !== null &&
    best.score - runnerUpScore < MIN_FUZZY_MATCH_MARGIN
  ) {
    return null;
  }

  return {
    item: best.item,
    method: "title",
    score: best.score,
    runnerUpScore
  };
}

function structuredResultMatch(
  card: Pick<SummaryCardRow, "source_item_id" | "agenda_item" | "source_url">,
  items: AgendaItem[]
) {
  const sourceItemId = String(card.source_item_id || "").trim();
  if (sourceItemId && uniqueSourceItemIds(items).has(sourceItemId)) {
    const match = items.find(
      (item) =>
        item.externalId === sourceItemId &&
        Boolean(item.result) &&
        OUTCOME_TERM_PATTERN.test([item.action, item.result].filter(Boolean).join(" "))
    );
    if (match) {
      return {
        item: match,
        method: "source_item_id" as const,
        score: 1,
        runnerUpScore: null
      };
    }
  }
  const sourceUrl = String(card.source_url || "").trim();
  const sourceUrlIsItemSpecific =
    Boolean(sourceUrl) &&
    items.filter((item) => agendaItemHasSourceUrl(item, sourceUrl)).length === 1;
  return findGuardedAgendaItemMatch(
    String(card.agenda_item || ""),
    items.filter(
      (item) =>
        Boolean(item.result) &&
        OUTCOME_TERM_PATTERN.test([item.action, item.result].filter(Boolean).join(" "))
    ),
    { sourceUrl: sourceUrlIsItemSpecific ? sourceUrl : null }
  );
}

export function isDecisionParticipationInstruction(title?: string | null) {
  return /\bpublic comment\b|\bcomment opportunity\b|\b(?:submit|send|email|provide)\s+(?:a\s+)?written comments?\b|\bwritten comment (?:instructions?|deadline|period)\b/i.test(
    String(title || "")
  );
}

function parsedMinuteItems(meeting: LlmReadyMeeting, document: PrimeGovDocument) {
  const text = normalizeSourceText(document.extractedText || "");
  return extractAgendaItemsFromText(meeting, text)
    .map((item) => {
      const block = item.agendaNumber
        ? numberedMinuteBlock(item.agendaNumber, text)
        : null;
      return {
        ...item,
        action: null,
        result: extractResultText(block || item.rowText),
        sourceUrl: document.url,
        rowText: cleanText(block || item.rowText).slice(0, 12000)
      };
    });
}

function majorSectionBlocks(title: string, text: string) {
  const lines = normalizeSourceText(text).split("\n");
  const escapedTitle = escapeRegExp(title);
  // Letter headings ("E. CONSENT CALENDAR") and numbered ones ("3. APPROVAL
  // OF THE CONSENT CALENDAR", "11. EPASD CONSENT CALENDAR", East Palo Alto).
  const titlePattern = new RegExp(
    `^(?:(?:[A-Z]|(\\d{1,2}))\\s*[.):-]\\s*)?(?:approval\\s+of\\s+(?:the\\s+)?)?(?:([A-Z]{2,8})\\s+)?${escapedTitle}\\s*$`,
    "i"
  );
  const sectionPattern = /^[A-Z]\s*[.):-]\s*[A-Z][\s\S]{1,100}$/;
  const uppercaseSectionPattern = /^[A-Z][A-Z0-9/&,'’() -]{3,100}[.:]?$/;
  const numberedSectionPattern = /^\d{1,2}\s*[.)]\s+[A-Z][A-Z0-9/&,'’() -]{3,100}[.:]?$/;
  const blocks: Array<{ text: string; number: string | null }> = [];
  for (let start = 0; start < lines.length; start += 1) {
    const match = lines[start].trim().match(titlePattern);
    // A body prefix ("EPASD") is only trusted on a numbered heading.
    if (!match || (match[2] && !match[1])) continue;
    const number = match[1] || null;
    // Without a number a later heading cannot be told apart from the first.
    if (number === null && blocks.some((block) => block.number === null)) continue;

    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (
        sectionPattern.test(line) ||
        uppercaseSectionPattern.test(line) ||
        (number !== null && numberedSectionPattern.test(line))
      ) {
        end = index;
        break;
      }
    }
    blocks.push({ text: lines.slice(start, end).join("\n"), number });
  }
  return blocks;
}

function consentItemWasSeparated(agendaNumber: string, section: string) {
  const number = escapeRegExp(agendaNumber);
  // Allow decimal points so "excluding Item 3.3 and 3.4" reaches 3.4.
  const gap = "(?:[^.\\n]|\\.(?=\\d)){0,180}";
  const separated = "(?:pulled|removed|separate(?:ly)?|continued|exclud(?:ed|ing)|except)";
  return new RegExp(
    `\\b(?:item\\s+)?${number}\\b${gap}\\b${separated}\\b|` +
      `\\b${separated}\\b${gap}\\b(?:item\\s+)?${number}\\b`,
    "i"
  ).test(section);
}

function consentCalendarOutcomeItems(
  document: PrimeGovDocument,
  items: AgendaItem[]
) {
  return majorSectionBlocks("Consent Calendar", document.extractedText || "").flatMap((block) =>
    consentSectionOutcomeItems(document, items, block)
  );
}

function consentSectionOutcomeItems(
  document: PrimeGovDocument,
  items: AgendaItem[],
  block: { text: string; number: string | null }
) {
  const section = block.text;
  // Minutes that give each item its own result line leave the calendar motion
  // nothing to add. Copying it reached Santa Clara County's Announcements and
  // Adjourn items, which follow the calendar under unrecognized headings with
  // no vote.
  if (ITEM_RESULT_LINE_PATTERN.test(section)) return [];
  const result = extractResultText(section);
  if (!result) return [];

  const consentSectionNumbers = items.flatMap((item) => {
    const number = String(item.agendaNumber || "").trim();
    return number && /consent calendar/i.test(`${item.itemType || ""} ${item.title || ""}`)
      ? [number]
      : [];
  });

  return items.flatMap((item) => {
    const agendaNumber = String(item.agendaNumber || "").trim();
    // A numbered heading names its own items, so the Sanitary District's
    // "11. EPASD CONSENT CALENDAR" motion stays off City items 3.x.
    const belongsToNumberedConsentSection = block.number !== null
      ? agendaNumber.startsWith(`${block.number}.`)
      : consentSectionNumbers.some((sectionNumber) => agendaNumber.startsWith(`${sectionNumber}.`));
    const explicitlyConsent =
      block.number === null && /consent calendar/i.test(String(item.itemType || ""));
    // Under a numbered heading the item number itself places the item on the
    // calendar; East Palo Alto minutes often record only the consent motion.
    const itemAppearsInConsentRecord =
      (block.number !== null && belongsToNumberedConsentSection) ||
      agendaItemSimilarity(String(item.title || item.rowText), section) >= MIN_FUZZY_MATCH_SCORE;
    if (
      !agendaNumber ||
      (!belongsToNumberedConsentSection && !explicitlyConsent) ||
      !itemAppearsInConsentRecord ||
      consentItemWasSeparated(agendaNumber, section)
    ) {
      return [];
    }

    return [{
      ...item,
      result,
      sourceUrl: document.url,
      rowText: `${item.rowText}\n${result}`
    } satisfies AgendaItem];
  });
}

function outcomeItemIdentity(item: AgendaItem) {
  return [
    normalizedIdentifier(item.agendaNumber),
    normalizedIdentifier(item.fileNumber),
    normalizedIdentifier(item.title || item.rowText)
  ].join("|");
}

export function extractMeetingOutcomeItems(meeting: LlmReadyMeeting) {
  const outcomes = new Map<string, AgendaItem>();
  let agendaItemsFound = meeting.items?.length || 0;

  for (const item of meeting.items || []) {
    const resultText = [item.action, item.result].filter(Boolean).join(" ");
    if (item.result && OUTCOME_TERM_PATTERN.test(resultText)) {
      outcomes.set(outcomeItemIdentity(item), item);
    }
  }

  for (const document of minutesDocuments(meeting)) {
    const parsed = parsedMinuteItems(meeting, document);
    agendaItemsFound = Math.max(agendaItemsFound, parsed.length);
    const parsedResults = parsed.filter((candidate) => Boolean(candidate.result));
    // The last item listed under a consent heading runs on into the consent
    // motion, so its own block yields the same result. Two copies under one id
    // read as ambiguous and the item would get no result at all.
    const sameMotion = (left: AgendaItem, right: AgendaItem) =>
      left.externalId === right.externalId &&
      cleanText(String(left.result || "")).toLowerCase() === cleanText(String(right.result || "")).toLowerCase();
    const consentItems = consentCalendarOutcomeItems(
      document,
      (meeting.items || []).length > 0 ? meeting.items || [] : parsed
    ).filter((item) => !parsedResults.some((candidate) => sameMotion(candidate, item)));
    for (const item of [...parsedResults, ...consentItems]) {
      outcomes.set(outcomeItemIdentity(item), item);
    }
  }

  return {
    items: Array.from(outcomes.values()),
    agendaItemsFound,
    informationalItemsFound: Math.max(0, agendaItemsFound - outcomes.size)
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numberedMinuteBlock(
  agendaNumber: string,
  text: string
) {
  const lines = text.split("\n");
  const requestedNumber = normalizedIdentifier(agendaNumber);
  const itemLinePattern =
    /^\s*(?:agenda\s+)?(?:item\s+)?([A-Z]?\d{1,2}(?:\.\d{1,3})?)\s*(?:[.)]|:\s+(?!\d)|-\s+(?!\d)|\s+)\s*\S/i;
  const sectionLinePattern = /^\s*[A-Z]\s*[.)-]\s+[A-Z][\s\S]{1,120}$/;
  const starts = lines.flatMap((line, index) => {
    const match = line.match(itemLinePattern);
    return normalizedIdentifier(match?.[1]) === requestedNumber ? [index] : [];
  });
  if (starts.length === 0) return null;

  const blockAt = (start: number) => {
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index];
      const match = line.match(itemLinePattern);
      const nextNumber = normalizedIdentifier(match?.[1]);
      if (
        (nextNumber && nextNumber !== requestedNumber) ||
        sectionLinePattern.test(line)
      ) {
        end = index;
        break;
      }
    }
    return lines.slice(start, end).join("\n").trim() || null;
  };

  // An item pulled from consent is listed with the calendar and recorded again
  // after the consent vote with its own motion (East Palo Alto). Use the
  // occurrence that records a result. Only sub-item numbers ("3.3") qualify:
  // a bare "3." recurs inside recommendation lists.
  if (requestedNumber.includes(".") && starts.length > 1) {
    for (const start of starts) {
      const block = blockAt(start);
      if (block && extractResultText(block)) return block;
    }
  }
  return blockAt(starts[0]);
}

function headedMinutesResult(cardTitle: string, text: string) {
  // Unnumbered minutes can identify motions with a resolution/minute-order
  // reference in a wrapped uppercase heading. Keep that evidence inside the
  // next heading. Minutes without such a heading get no result here: the old
  // fallback took the first vote in a text window around the title's words,
  // and a 2026-10-05 sample found 26 of 36 such results belonged to a
  // neighboring item, a procedural motion, or page boilerplate.
  const paragraphs = text.split(/\n{2,}/);
  const headings = paragraphs.flatMap((paragraph, index) => {
    const title = cleanText(paragraph);
    return title.length <= 600 && /[A-Z]/.test(title) && title === title.toUpperCase()
      ? [{ title, index }]
      : [];
  });
  const headedItems = headings.flatMap((heading, index) => {
    const reference = /\b(?:(?:CITY|EMID)\s+)?(?:RESOLUTION|MINUTE ORDER)\s+NO\.\s*\d/.exec(heading.title);
    if (!reference) return [];
    const end = headings[index + 1]?.index ?? paragraphs.length;
    const body = paragraphs.slice(heading.index + 1, end).join("\n\n");
    return [{
      externalId: `minutes-heading-${heading.index}`,
      fileNumber: null,
      agendaNumber: null,
      itemType: null,
      // The record number is metadata, not part of the subject's identity.
      title: heading.title.slice(0, reference.index).replace(/\.(?=\s|$)/g, "").trim(),
      action: null,
      result: extractResultText(body),
      sourceUrl: "",
      rowText: [paragraphs[heading.index], body].join("\n\n")
    } satisfies AgendaItem];
  });
  return findGuardedAgendaItemMatch(cardTitle, headedItems);
}

function comparableAgendaNumber(value?: string | null) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "") || null;
}

function minutesResultForCard(
  card: Pick<SummaryCardRow, "source_item_id" | "agenda_item" | "source_url">,
  meeting: LlmReadyMeeting
) {
  const title = String(card.agenda_item || "").trim();
  if (!title) return null;
  const inventory = extractMeetingOutcomeItems(meeting);
  const sourceItemId = String(card.source_item_id || "").trim();
  if (sourceItemId && uniqueSourceItemIds(inventory.items).has(sourceItemId)) {
    const item = inventory.items.find(
      (candidate) => candidate.externalId === sourceItemId && Boolean(candidate.result)
    );
    const document = item
      ? minutesDocuments(meeting).find((candidate) => candidate.url === item.sourceUrl) ||
        minutesDocuments(meeting)[0]
      : null;
    if (item && document) {
      return {
        item,
        document,
        match: {
          item,
          method: "source_item_id" as const,
          score: 1,
          runnerUpScore: null
        }
      };
    }
  }
  // A card that knows its own agenda number may not take the result of a
  // differently numbered item by title similarity ("Cash Disbursement Report
  // for April" must not take item 11.2's May report).
  const ownItem =
    sourceItemId && uniqueSourceItemIds(meeting.items || []).has(sourceItemId)
      ? (meeting.items || []).find((item) => item.externalId === sourceItemId)
      : null;
  const ownAgendaNumber = comparableAgendaNumber(ownItem?.agendaNumber);
  const conflictsWithOwnItem = (item: AgendaItem) => {
    const number = comparableAgendaNumber(item.agendaNumber);
    return Boolean(ownAgendaNumber && number && number !== ownAgendaNumber);
  };
  // Legacy cards can predate source_item_id while still having a unique,
  // high-confidence match in the official result inventory. Resolve that
  // direct match before deriving an agenda number from broader agenda data;
  // otherwise a shared meeting URL or stale agenda identity can steer the
  // card away from the exact result that its title identifies.
  const directInventoryMatch = findGuardedAgendaItemMatch(title, inventory.items);
  // Once the title has pointed at a differently numbered item, the loose title
  // window below would only find that item's motion again.
  let titlePointsElsewhere = Boolean(
    directInventoryMatch?.item.result && conflictsWithOwnItem(directInventoryMatch.item)
  );
  if (directInventoryMatch?.item.result && !titlePointsElsewhere) {
    const document =
      minutesDocuments(meeting).find(
        (candidate) => candidate.url === directInventoryMatch.item.sourceUrl
      ) || minutesDocuments(meeting)[0];
    if (document) {
      return {
        item: directInventoryMatch.item,
        document,
        match: directInventoryMatch
      };
    }
  }
  const agendaMatch = ownItem
    ? { item: ownItem }
    : findGuardedAgendaItemMatch(title, meeting.items || [], {
        sourceUrl: card.source_url
      });
  const agendaNumber = String(agendaMatch?.item.agendaNumber || "").trim();
  const inventoryMatch = findGuardedAgendaItemMatch(title, inventory.items, {
    agendaNumber
  });
  if (inventoryMatch?.item.result && conflictsWithOwnItem(inventoryMatch.item)) {
    titlePointsElsewhere = true;
  } else if (inventoryMatch?.item.result) {
    const document =
      minutesDocuments(meeting).find(
        (candidate) => candidate.url === inventoryMatch.item.sourceUrl
      ) || minutesDocuments(meeting)[0];
    if (document) {
      return { item: inventoryMatch.item, document, match: inventoryMatch };
    }
  }

  for (const document of minutesDocuments(meeting)) {
    const text = normalizeSourceText(document.extractedText || "");
    const numberedBlock = agendaNumber ? numberedMinuteBlock(agendaNumber, text) : null;
    const headingMatch = numberedBlock || titlePointsElsewhere ? null : headedMinutesResult(title, text);
    const block = numberedBlock || headingMatch?.item.rowText || null;
    const result = numberedBlock
      ? extractResultText(numberedBlock)
      : headingMatch?.item.result || null;
    // A matched heading with no result keeps a nearby vote from replacing it.
    if (!result || (!numberedBlock && !headingMatch)) continue;

    let match: GuardedAgendaItemMatch;
    if (numberedBlock) {
      match = {
          item: {
            externalId: `minutes-item-${agendaNumber}`,
            fileNumber: agendaMatch?.item.fileNumber || null,
            agendaNumber,
            itemType: agendaMatch?.item.itemType || null,
            title,
            action: null,
            result,
            sourceUrl: document.url,
            rowText: numberedBlock
          },
          method: "agenda_number",
          score: 1,
          runnerUpScore: null
        };
    } else if (headingMatch) {
      match = headingMatch;
    } else {
      continue;
    }

    return {
      item: {
        ...match.item,
        result,
        sourceUrl: document.url,
        rowText: block || match.item.rowText
      },
      document,
      match
    };
  }

  return null;
}

function officialSummary(item: AgendaItem, outcome: CanonicalDecisionOutcome) {
  const result = sentenceCase(String(item.result || ""));
  const action = sentenceCase(String(item.action || ""));
  const distinctAction = action && action.toLowerCase() !== result.toLowerCase();

  if (outcome.canonicalStatus === "recommended") {
    return outcome.headline === "Recommendation failed"
      ? "The official record shows that the recommendation did not pass."
      : "The committee recommended this item for approval. This was not final approval of the underlying proposal.";
  }
  if (outcome.canonicalStatus === "heard_and_filed") {
    return "The committee heard the item and filed it. The record does not show final approval of the underlying proposal.";
  }
  if (outcome.canonicalStatus === "committee_action") {
    return "The recorded committee motion passed. This was not final approval of the underlying proposal.";
  }
  if (outcome.headline === "Amended in committee") {
    return "The committee amended the item. This was not final approval of the underlying proposal.";
  }

  if (distinctAction && OUTCOME_TERM_PATTERN.test(action)) {
    return `The official meeting record lists the action as ${action} and the result as ${result}.`;
  }
  return `The official minutes record this item as ${result}.`;
}

function matchedItemKey(item: AgendaItem, sourceUrl: string) {
  const agendaNumber = normalizedIdentifier(item.agendaNumber);
  const officialIdentity = {
    sourceUrl,
    ...(agendaNumber
      ? { agendaNumber }
      : {
          externalId: normalizedIdentifier(item.externalId),
          fileNumber: normalizedIdentifier(item.fileNumber),
          title: normalizedIdentifier(item.title),
          rowText: normalizedIdentifier(item.rowText)
        })
  };
  return crypto.createHash("sha256").update(JSON.stringify(officialIdentity)).digest("hex");
}

function meetingDecisionDate(meeting: LlmReadyMeeting) {
  const dateText = [meeting.dateText, meeting.timeText].filter(Boolean).join(" ");
  return parseMeetingDate(dateText) || null;
}

export function extractDecisionOutcome(
  card: Pick<SummaryCardRow, "id" | "source_item_id" | "agenda_item" | "source_url">,
  meeting: LlmReadyMeeting
): DecisionOutcomeDraft | null {
  if (!DECISION_OUTCOME_JURISDICTIONS.has(String(meeting.jurisdictionSlug || ""))) return null;
  if (meeting.status !== "Past") return null;
  if (isDecisionParticipationInstruction(card.agenda_item)) {
    return null;
  }

  const structuredMatch = structuredResultMatch(card, meeting.items || []);
  const minutesMatch = structuredMatch ? null : minutesResultForCard(card, meeting);
  const match = structuredMatch || minutesMatch?.match;
  const item = structuredMatch?.item || minutesMatch?.item;
  if (!item?.result) return null;

  const sourceText = [item.action, item.result].filter(Boolean).join(" | ");
  const canonical = interpretOfficialAction(item.action, item.result, meeting);
  const minutesDocument =
    minutesMatch?.document || officialMinutesDocuments(meeting)[0] || null;
  const sourceUrl =
    minutesDocument?.url || meeting.meetingDetailsUrl || item.sourceUrl || meeting.sourceUrl || "";
  if (!sourceUrl) return null;

  const summary = officialSummary(item, canonical);
  const normalizedAction = normalizeSourceText(sourceText);
  const normalizedItemContext = normalizeSourceText(item.rowText || "");
  const sourceContext = [
    "Official action/result:",
    normalizedAction,
    ...(normalizedItemContext && normalizedItemContext !== normalizedAction
      ? ["Official item context:", normalizedItemContext]
      : [])
  ]
    .join("\n\n")
    .slice(0, 6000);
  const sourceHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        version: DECISION_OUTCOME_EXPLANATION_FINGERPRINT_VERSION,
        cardId: card.id,
        cardTitle: cleanText(String(card.agenda_item || "")),
        jurisdictionSlug: meeting.jurisdictionSlug,
        meetingTitle: meeting.title,
        canonicalStatus: canonical.canonicalStatus,
        canonicalHeadline: canonical.headline,
        fallbackSummary: summary,
        fallbackNextStep: canonical.nextStep,
        sourceUrl,
        sourceText,
        sourceContext
      })
    )
    .digest("hex");

  return {
    kind: canonical.kind,
    headline: canonical.headline,
    summary,
    decidedAt: meetingDecisionDate(meeting),
    vote: extractVoteDetail(sourceText),
    nextStep: canonical.nextStep,
    sourceUrl,
    sourceHash,
    sourceText,
    matchedItemKey: matchedItemKey(item, sourceUrl),
    matchedAgendaNumber: item.agendaNumber || null,
    matchMethod: match?.method || "title",
    matchScore: match?.score || 0,
    canonicalStatus: canonical.canonicalStatus,
    sourceContext
  };
}
