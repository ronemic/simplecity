import type { SummaryCardRow } from "@/lib/types";
import { hasCommentOptionInfo } from "@/lib/utils/commentDeadline";

const IMPACT_CATEGORY_SCORES: Record<string, number> = {
  Housing: 34,
  "Budget & Taxes": 32,
  Transportation: 30,
  "Public Safety": 30,
  "Schools & Youth": 26,
  "City Services": 24,
  "Business & Development": 22,
  "Parks & Environment": 20
};

const HIGH_IMPACT_PATTERNS = [
  /\b(public hearing|hearing|ordinance|resolution|vote|adopt|approve|authorize|award|contract|agreement|grant|budget|fee|tax|rate|bond|funding|spending|appropriation)\b/i,
  /\b(housing|affordable|rent|tenant|zoning|development|permit|construction|traffic|parking|road|transit|bike|pedestrian|safety|police|fire|emergency|health|clinic|child|youth|school)\b/i,
  /\b(water|sewer|utility|garbage|library|park|trail|flood|climate|eviction|domestic violence|homeless|shelter)\b/i,
  /\$\s?\d|\b\d+(?:\.\d+)?\s?%/i
];

const ROUTINE_PATTERNS = [
  /\b(consent calendar minutes|approve (?:the )?(?:consent calendar )?minutes|meeting minutes)\b/i,
  /\b(call to order|roll call|pledge of allegiance|adjournment|approval of agenda)\b/i,
  /\b(recognize|recognition|proclamation|commendation|certificate)\b/i,
  /\bnational .+ month\b/i,
  /\bpresentation only\b/i
];

const PROCEDURAL_PATTERNS = [
  /\b(ad hoc|nominating|appoint(?:ment)?|appoint commissioners?|committee appointments?|officer election|bylaws?|rules of procedure|work plan)\b/i,
  /\b(elect chair|elect vice chair|select chair|select vice chair)\b/i
];

const CANCELLATION_PATTERNS = [
  /\bcancell?ed\b/i,
  /\bcancellation\b/i,
  /\bnotice of cancellation\b/i
];

function compactText(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function cardText(card: SummaryCardRow) {
  return compactText([
    card.agenda_item,
    card.what_is_happening,
    card.why_it_matters,
    card.status,
    card.meetings?.title,
    card.meetings?.meeting_type
  ]);
}

function meetingTime(card: SummaryCardRow) {
  const value = card.meetings?.meeting_datetime || card.meetings?.date_text || card.created_at;
  if (!value) return 0;

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function hasCardCommentOptionInfo(card: SummaryCardRow) {
  return hasCommentOptionInfo({
    closes: card.comment_window_closes,
    actionTexts: [
      card.how_to_act_submit_comment,
      card.how_to_act_email
    ]
  });
}

export function isRoutineOrCeremonialCard(card: SummaryCardRow) {
  const text = cardText(card);
  return ROUTINE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isProceduralCard(card: SummaryCardRow) {
  const text = cardText(card);
  return PROCEDURAL_PATTERNS.some((pattern) => pattern.test(text));
}

export function isCancellationCard(card: SummaryCardRow) {
  const text = cardText(card);
  return CANCELLATION_PATTERNS.some((pattern) => pattern.test(text));
}

export function publicInterestScore(card: SummaryCardRow) {
  const text = cardText(card);
  let score = 0;

  for (const category of card.category_tags || []) {
    score += IMPACT_CATEGORY_SCORES[category] || 0;
  }

  if (card.status === "Upcoming vote") score += 32;
  if (card.status === "Under discussion") score += 22;
  if (card.status === "Passed") score += 10;
  if (card.status === "Information only") score -= 8;
  if (card.meetings?.status === "Upcoming") score += 12;
  if (hasCardCommentOptionInfo(card)) score += 4;

  for (const pattern of HIGH_IMPACT_PATTERNS) {
    if (pattern.test(text)) score += 14;
  }

  if (isRoutineOrCeremonialCard(card)) score -= 90;
  if (isProceduralCard(card)) score -= 42;
  if (isCancellationCard(card)) score -= 32;

  return score;
}

export function isPublicInterestCard(card: SummaryCardRow) {
  return publicInterestScore(card) >= 34 && !isRoutineOrCeremonialCard(card);
}

export function compareCardsByPublicInterest(left: SummaryCardRow, right: SummaryCardRow) {
  const scoreDelta = publicInterestScore(right) - publicInterestScore(left);
  if (scoreDelta !== 0) return scoreDelta;

  const leftTime = meetingTime(left);
  const rightTime = meetingTime(right);
  const now = Date.now();
  const leftFuture = leftTime >= now;
  const rightFuture = rightTime >= now;

  if (leftFuture !== rightFuture) return leftFuture ? -1 : 1;
  if (leftFuture && rightFuture) return leftTime - rightTime;
  return rightTime - leftTime;
}

export function publicAgendaTitle(card: SummaryCardRow) {
  const agendaItem = String(card.agenda_item || "").trim();
  if (!agendaItem) return "Agenda item not listed";

  return agendaItem
    .replace(/\bEstablish Nominating Ad Hoc Committee\b/i, "Create a temporary nominating committee")
    .replace(/\bAd Hoc\b/g, "temporary")
    .replace(/\bApprove Consent Calendar minutes from\b/i, "Approve minutes from")
    .replace(/\bRecognize\b/i, "Ceremonial recognition:")
    .replace(/\bPersonnel Board Appeal Hearing Cancellation\b/i, "Canceled personnel appeal hearing");
}
