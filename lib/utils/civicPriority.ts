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

const DASH_SEPARATOR_PATTERN = /\s+[-\u2011\u2013\u2014]\s+/;
const RECENCY_WINDOW_DAYS = 60;
const RECENCY_MAX_BONUS = 24;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function compactText(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function cleanupPublicTitle(value: string) {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();

  return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : cleaned;
}

function lowerFirstWord(value: string) {
  const cleaned = cleanupPublicTitle(value);
  if (/^[A-Z]{2,}\b/.test(cleaned)) return cleaned;
  return cleaned ? `${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}` : cleaned;
}

function lowerPublicPhrase(value: string) {
  return value
    .split(/\s+/)
    .map((word) => (/\d/.test(word) || /^[A-Z]{2,}s?\b/.test(word) ? word : word.toLowerCase()))
    .join(" ");
}

function cleanAgendaTitle(value: string) {
  return cleanupPublicTitle(
    value
      .replace(/\u2011/g, "-")
      .replace(/\bFY\s*(\d{4})\s*[-\u2013\u2014]\s*(\d{4})\b/gi, (_match, start: string, end: string) => {
        return `${start}-${end.slice(-2)}`;
      })
      .replace(/^\s*(?:agenda\s+)?item\s+\d+(?:\.\d+)*[.)]?\s+/i, "")
      .replace(/^\s*\d+(?:\.\d+)+[.)]?\s+/i, "")
      .replace(/^\s*\d+[.)]\s+/i, "")
      .replace(/\s*\((?:item|chapter)\s+[^)]*\)/gi, "")
      .replace(/\s*\([A-Z]{1,6}-?\d{2,}[\w.-]*(?:,\s*[A-Z]{1,6}-?\d{2,}[\w.-]*)*\)/g, "")
      .replace(/\bF\.?Y\.?\s+/gi, "")
  );
}

function fiscalYearLabel(title: string) {
  return title.match(/\b(20\d{2})-(\d{2})\b/)?.[0] || null;
}

function civicDepartmentPhrase(value: string) {
  return lowerPublicPhrase(
    value
      .replace(/\bDepartment\b/gi, "")
      .replace(/\bServices\b/gi, "services")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function readableAgreementSubject(value: string) {
  return lowerPublicPhrase(
    value
      .replace(/\bJuvenile Diversion Program Case Management Services\b/gi, "juvenile diversion case management")
      .replace(/\bStreet Rehabilitation Package\b/gi, "street repairs")
      .replace(/\bStreet Rehabilitation\b/gi, "street repairs")
      .replace(/\bCase Management Services\b/gi, "case management services")
      .replace(/\bProgram\b/gi, "program")
      .replace(/\bServices\b/gi, "services")
      .trim()
  );
}

function publicBudgetTitle(title: string) {
  const fiscalYear = fiscalYearLabel(title);

  if (/\brecommended budget\b/i.test(title) && /\bcounty of santa clara\b/i.test(title)) {
    return `Santa Clara County${fiscalYear ? ` ${fiscalYear}` : ""} budget vote`;
  }

  const departmentBudget = title.match(new RegExp(`^(.+?)${DASH_SEPARATOR_PATTERN.source}(?:${fiscalYear || "\\d{4}-\\d{2}"}\\s+)?Budget$`, "i"));
  if (departmentBudget) {
    return cleanupPublicTitle(`${civicDepartmentPhrase(departmentBudget[1])} ${fiscalYear || ""} budget`);
  }

  return null;
}

function publicProjectTitle(title: string) {
  const addressProject = title.match(new RegExp(`^(\\d[^\\u2013\\u2014-]+?)${DASH_SEPARATOR_PATTERN.source}New\\s+(.+)$`, "i"));
  if (addressProject) {
    const description = addressProject[2]
      .replace(/\bEight-Story\b/gi, "8-story")
      .replace(/\bCommercial\/Residential\b/gi, "commercial and residential")
      .replace(/\bMixed-Use\b/gi, "mixed-use")
      .replace(/\bBuilding\b/gi, "building");

    if (/\bmixed-use building\b/i.test(description)) {
      const height = description.match(/\b(?:\d+|[a-z]+)-story\b/i)?.[0].toLowerCase();
      return cleanupPublicTitle(`New ${height ? `${height} ` : ""}mixed-use building at ${addressProject[1].trim()}`);
    }

    return cleanupPublicTitle(`New ${lowerFirstWord(description)} at ${addressProject[1].trim()}`);
  }

  if (/\bgilead\b/i.test(title) && /\bcampus expansion\b/i.test(title) && /\bparking agreement\b/i.test(title)) {
    return "Gilead campus expansion approvals and parking agreement";
  }

  if (/\bgilead\b/i.test(title) && /\bcampus expansion\b/i.test(title) && /\bmaster plan\b/i.test(title)) {
    return "Gilead campus expansion plan";
  }

  return null;
}

function publicRulesOrPlanTitle(title: string) {
  if (/\b(accessory dwelling unit|ADU)\b/i.test(title) && /\bzoning\b/i.test(title)) {
    return "Rules for accessory dwelling units (ADUs)";
  }

  if (/\bstorm drain master plan\b/i.test(title) && /\badoption recommendation\b/i.test(title)) {
    return "Recommend adopting the storm drain plan";
  }

  if (/\bclimate action plan overview\b/i.test(title)) {
    const place = title.match(/^(.+?)\s+Climate Action Plan Overview$/i)?.[1];
    return cleanupPublicTitle(`${place ? `${place} ` : ""}climate action plan update`);
  }

  return null;
}

function publicStaffingTitle(title: string) {
  const staffing = title.match(/^(.+?)\s+staffing changes\b/i);
  if (!staffing) return null;
  return `Staffing changes for ${civicDepartmentPhrase(staffing[1])}`;
}

function publicAgreementTitle(title: string) {
  const agreement = title.match(new RegExp(`^(.+?)${DASH_SEPARATOR_PATTERN.source}Agreement$`, "i"));
  if (!agreement) return null;

  const subject = readableAgreementSubject(agreement[1]);
  return subject ? cleanupPublicTitle(`${subject} contract`) : null;
}

function readableAgendaFallback(title: string) {
  return cleanupPublicTitle(
    title
      .replace(/\bSpecial Programs? and Reserves? adjustments?\b/gi, "Special program and reserve fund changes")
      .replace(/^Adopt\s+(?:a\s+)?Resolution\s+approving\s+(?:the\s+)?/i, "Vote on ")
      .replace(/^Approve\s+(?!minutes\b)(?:the\s+)?/i, "Vote on ")
      .replace(/^Amendments?\s+to\s+/i, "Changes to ")
      .replace(/\bAdoption Recommendation\b/gi, "adoption recommendation")
      .replace(/\bMaster Plan\b/gi, "plan")
      .replace(/\bCommercial\/Residential\b/gi, "commercial and residential")
      .replace(/\bMixed-Use\b/gi, "mixed-use")
      .replace(/\bEight-Story\b/gi, "eight-story")
      .replace(/\bStreet Rehabilitation\b/gi, "street repairs")
      .replace(/\bDepartment\b/gi, "department")
      .replace(/\bServices\b/gi, "services")
  );
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

function recencyScore(card: SummaryCardRow, now = Date.now()) {
  const time = meetingTime(card);
  if (!time) return 0;

  const ageInDays = Math.abs(now - time) / DAY_IN_MS;
  const bonus = RECENCY_MAX_BONUS * (1 - ageInDays / RECENCY_WINDOW_DAYS);
  return Math.max(0, bonus);
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

export function compareCardsByPublicInterest(left: SummaryCardRow, right: SummaryCardRow, now = Date.now()) {
  const leftTime = meetingTime(left);
  const rightTime = meetingTime(right);
  const leftFuture = leftTime >= now;
  const rightFuture = rightTime >= now;

  if (leftFuture !== rightFuture) {
    return Number(rightFuture) - Number(leftFuture);
  }

  const freshnessDelta = recencyScore(right, now) - recencyScore(left, now);
  if (freshnessDelta !== 0) return freshnessDelta;

  const scoreDelta = publicInterestScore(right) - publicInterestScore(left);
  if (scoreDelta !== 0) return scoreDelta;
  if (leftFuture && rightFuture) return leftTime - rightTime;
  return rightTime - leftTime;
}

export function publicAgendaTitle(card: SummaryCardRow) {
  const agendaItem = String(card.agenda_item || "").trim();
  if (!agendaItem) return "Agenda item not listed";

  const title = cleanAgendaTitle(agendaItem)
    .replace(/\bEstablish Nominating Ad Hoc Committee\b/i, "Create a temporary nominating committee")
    .replace(/\bAd Hoc\b/g, "temporary")
    .replace(/\bApprove Consent Calendar minutes from\b/i, "Approve minutes from")
    .replace(/\bRecognize\b/i, "Ceremonial recognition:")
    .replace(/\bPersonnel Board Appeal Hearing Cancellation\b/i, "Canceled personnel appeal hearing");

  return (
    publicBudgetTitle(title) ||
    publicProjectTitle(title) ||
    publicRulesOrPlanTitle(title) ||
    publicStaffingTitle(title) ||
    publicAgreementTitle(title) ||
    readableAgendaFallback(title)
  );
}
