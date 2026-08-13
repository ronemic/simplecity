import type { SummaryCardRow } from "@/lib/types";
import { hasCommentOptionInfo } from "@/lib/utils/commentDeadline";
import { normalizeSummaryPoints } from "@/lib/utils/summaryPoints";
import { officialSourceFallbackReason } from "@/lib/utils/summaryFallback";

const IMPACT_CATEGORY_SCORES: Record<string, number> = {
  Housing: 34,
  "Budget & Taxes": 32,
  Transportation: 30,
  "Public Safety": 30,
  "Schools & Youth": 26,
  "Teaching & Learning": 28,
  "Students & Families": 26,
  "School Buildings & Grounds": 24,
  "School Funding": 32,
  "Teachers & Staff": 26,
  "Safety & Wellness": 30,
  "Enrollment & Boundaries": 28,
  "Board & Administration": 22,
  "City Services": 24,
  "Business & Development": 22,
  "Parks & Environment": 20
};

/**
 * Subject matter that turns up in someone's actual day: where they live, how
 * they get around, what they pay, whether services run.
 *
 * Parliamentary verbs — vote, adopt, approve, authorize, resolution — are
 * deliberately NOT here. They appear on nearly every agenda item, so scoring
 * them rewarded procedural filler as highly as a rezoning. What earns a homepage
 * slot is the subject, not the motion type attached to it.
 */
const DAILY_LIFE_PATTERNS: Array<[RegExp, number]> = [
  [/\b(housing|affordable housing|rent|renters?|tenants?|eviction|homeless(?:ness)?|shelter|accessory dwelling|ADUs?)\b/i, 30],
  [/\b(tax|taxes|fees?|rates?|fines?|assessments?|surcharge|utility bill)\b/i, 26],
  // Public money is a daily-life subject, not merely a procedural one: a budget
  // hearing decides service levels. Filing this under "binding actions" meant a
  // continued budget hearing scored well but failed the impact gate entirely.
  [/\b(budget|funding|appropriations?|spending|revenue|deficit|shortfall|fiscal|reserves?)\b/i, 22],
  [/\b(traffic|parking|roads?|streets?|sidewalks?|crosswalks?|bike|bicycle|pedestrian|transit|bus|rail|train|speed limit|intersection)\b/i, 26],
  [/\b(police|fire|emergency|crime|ambulance|paramedic|disaster|evacuation|flood(?:ing)?|wildfire|earthquake)\b/i, 26],
  [/\b(zoning|rezon\w+|general plan|land use|subdivision|construction|building height|density|development agreement)\b/i, 24],
  [/\b(water|sewer|storm drain|garbage|trash|recycling|utility|utilities|electricity|power|solar|energy|broadband|internet|wi-?fi)\b/i, 24],
  [/\b(climate|emissions|air quality|groundwater|drought|sea level)\b/i, 20],
  [/\b(schools?|students?|classrooms?|teachers?|child ?care|preschool|playground|youth program)\b/i, 24],
  [/\b(health|clinic|hospital|mental health|food|nutrition|seniors?|disabilit\w+|accessib\w+)\b/i, 22],
  [/\b(parks?|trails?|library|libraries|pool|community center|open space|trees?)\b/i, 18]
];

/** Actions that bind — worth points, but only alongside a real subject. */
const BINDING_ACTION_PATTERNS: Array<[RegExp, number]> = [
  [/\b(ordinance|public hearing|ballot measure|bond measure|moratorium)\b/i, 16],
  [/\bcapital improvement\b/i, 14]
];

const ROUTINE_PATTERNS = [
  /\b(consent calendar minutes|approve (?:the )?(?:consent calendar )?minutes|meeting minutes)\b/i,
  /\b(call to order|roll call|pledge of allegiance|adjournment|approval of agenda)\b/i,
  /\b(recognize|recognition|proclamation|commendation|certificate)\b/i,
  /\bnational .+ month\b/i,
  /\bpresentation only\b/i,
  /\b(introduce and welcome|swearing[- ]in|oath of office|installation of officers)\b/i
];

/**
 * The internal housekeeping of running a public body. Real work, but it is not
 * what "decisions that may affect daily life" is promising a reader.
 */
const PROCEDURAL_PATTERNS = [
  /\b(ad hoc|nominating|appoint(?:ment)?s?|appoint commissioners?|committee appointments?|officer election|bylaws?|rules of procedure|work ?plans?)\b/i,
  /\b(elect|select) (?:a )?(?:new )?(?:chair|vice chair|president|secretary)\b/i,
  /\b(orientation|annual report|receive and file|informational (?:item|update|report)|status update|(?:monthly|quarterly|mid-?year) report)\b/i,
  /\b(meeting end time|item rollover|terms? and limits?|term limits?|meeting schedule|calendar of meetings)\b/i,
  // Announcements that a meeting will occur. "Notice of public hearing" is
  // deliberately excluded from this list — a hearing notice is a real chance to
  // be heard, which is the opposite of housekeeping.
  /\bmeeting notice\b/i,
  /\bnotice of (?:a |an )?(?:special|joint|regular|adjourned|closed)\b[^.]{0,24}\bmeeting\b/i,
  /\bspecial joint (?:commission|committee|board)\b/i
];

/**
 * Agenda items that only announce that a meeting is happening.
 *
 * Anchored to the start of the agenda item rather than searched across the card
 * text, because "special meeting" legitimately appears inside real items ("public
 * hearing at the special meeting of…"). These read circularly on the homepage:
 * the connected decision restates the meeting it belongs to.
 */
const MEETING_ANNOUNCEMENT_PATTERNS = [
  /^\s*(?:notice of\s+)?(?:an?\s+)?(?:special|regular|adjourned|closed|joint|annual)\s+(?:session|meeting)\b/i,
  /^\s*meeting of the\b/i,
  /^\s*(?:call|notice) of\s+(?:a\s+)?(?:special|closed)\b/i
];

export function isMeetingAnnouncementCard(card: SummaryCardRow) {
  const agendaItem = String(card.agenda_item || "").trim();
  if (!agendaItem) return false;
  return MEETING_ANNOUNCEMENT_PATTERNS.some((pattern) => pattern.test(agendaItem));
}

const WITHDRAWN_PATTERNS = [
  /\bwithdrawn\b/i,
  /\bremoved from (?:the )?agenda\b/i,
  /\bno action taken\b/i
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

export function digestMeetingCutoff(now = new Date()) {
  const startOfThisWeek = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const daysSinceMonday = (startOfThisWeek.getUTCDay() + 6) % 7;
  startOfThisWeek.setUTCDate(startOfThisWeek.getUTCDate() - daysSinceMonday - 7);
  return startOfThisWeek;
}

export function isMeetingFreshForDigest(card: SummaryCardRow, now = new Date()) {
  const value = card.meetings?.meeting_datetime;
  if (!value) return false;

  const meetingTime = Date.parse(value);
  return !Number.isNaN(meetingTime) && meetingTime >= digestMeetingCutoff(now).getTime();
}

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
    ...normalizeSummaryPoints(card.what_is_happening),
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

const MONEY_PATTERN = /\$\s?([\d][\d,]*(?:\.\d+)?)\s*(billion|million|thousand|[bmk])?\b/gi;

function largestDollarAmount(text: string) {
  let largest = 0;

  for (const match of text.matchAll(MONEY_PATTERN)) {
    let amount = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;

    const unit = (match[2] || "").toLowerCase();
    if (unit.startsWith("b")) amount *= 1e9;
    else if (unit.startsWith("m")) amount *= 1e6;
    else if (unit.startsWith("k") || unit === "thousand") amount *= 1e3;

    largest = Math.max(largest, amount);
  }

  return largest;
}

/**
 * How much money is at stake, on a log scale — roughly $10k→8, $1M→16, $60M→23.
 *
 * A flat bonus for containing a dollar sign ranked a $49,994 drone donation above
 * a $60,000,000 housing bond. Magnitude is the whole point of the signal.
 */
export function moneyScore(text: string) {
  const amount = largestDollarAmount(text);
  if (amount < 1000) return 0;
  return Math.min(26, Math.max(0, Math.round((Math.log10(amount) - 3) * 4 + 4)));
}

function dailyLifeScore(text: string) {
  let score = 0;
  for (const [pattern, weight] of DAILY_LIFE_PATTERNS) {
    if (pattern.test(text)) score += weight;
  }
  // Capped so an item that name-drops many topics cannot outrank a focused one.
  return Math.min(score, 62);
}

export function hasDailyLifeSubject(card: SummaryCardRow) {
  const text = cardText(card);
  return DAILY_LIFE_PATTERNS.some(([pattern]) => pattern.test(text));
}

export function isWithdrawnCard(card: SummaryCardRow) {
  const text = cardText(card);
  return WITHDRAWN_PATTERNS.some((pattern) => pattern.test(text));
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

  // Capped rather than summed: a broad visioning document gets tagged with every
  // category and was scoring higher than an actual rezoning on that basis alone.
  let categoryScore = 0;
  for (const category of card.category_tags || []) {
    categoryScore += IMPACT_CATEGORY_SCORES[category] || 0;
  }
  score += Math.min(categoryScore, 44);

  if (card.status === "Upcoming vote") score += 32;
  if (card.status === "Routine approval") score -= 20;
  if (card.status === "Under discussion") score += 22;
  if (card.status === "Passed") score += 10;
  if (card.status === "Information only") score -= 8;
  if (hasCardCommentOptionInfo(card)) score += 4;

  score += dailyLifeScore(text);
  score += moneyScore(text);

  for (const [pattern, weight] of BINDING_ACTION_PATTERNS) {
    if (pattern.test(text)) score += weight;
  }

  // Heavy enough that housekeeping cannot climb back over the threshold on the
  // strength of a category tag alone.
  // No plain-language summary means the card cannot deliver what this section
  // promises, so it should not headline — but it stays available on the decisions
  // list, since the underlying decision is real.
  if (officialSourceFallbackReason(card.why_it_matters)) score -= 60;

  if (isMeetingAnnouncementCard(card)) score -= 100;
  if (isRoutineOrCeremonialCard(card)) score -= 140;
  if (isProceduralCard(card)) score -= 80;
  if (isWithdrawnCard(card)) score -= 90;
  if (isCancellationCard(card)) score -= 70;

  return score;
}

const PUBLIC_INTEREST_THRESHOLD = 58;

/**
 * Whether an item belongs under "decisions that may affect daily life".
 *
 * Requires a real reason, not just a passing score: identifiable daily-life
 * subject matter, meaningful money, or a vote a reader could still show up for.
 * A score alone used to be satisfiable by a category tag plus the word "approve".
 */
export function isPublicInterestCard(card: SummaryCardRow) {
  if (
    isRoutineOrCeremonialCard(card) ||
    isProceduralCard(card) ||
    isMeetingAnnouncementCard(card) ||
    isWithdrawnCard(card) ||
    isCancellationCard(card)
  ) {
    return false;
  }

  // This section's whole promise is a plain-language summary. A card that fell
  // back to raw agenda text cannot keep that promise, so it stays on the full
  // decisions list instead of headlining here.
  if (officialSourceFallbackReason(card.why_it_matters)) return false;

  const hasImpactReason =
    hasDailyLifeSubject(card) ||
    moneyScore(cardText(card)) >= 12 ||
    card.status === "Upcoming vote";

  return hasImpactReason && publicInterestScore(card) >= PUBLIC_INTEREST_THRESHOLD;
}

const STALENESS_WINDOW_DAYS = 180;
const STALENESS_FLOOR = 0.5;

/**
 * Discounts decisions as they age, so the homepage reads as current business.
 *
 * Upcoming items are never discounted — they are inherently current. Past items
 * fade to half weight over six months, which is gentle enough that a major
 * decision still outranks a minor fresh one, but firm enough that a moderate item
 * from last week beats a similar one from spring.
 */
function freshnessFactor(card: SummaryCardRow, now = Date.now()) {
  const time = meetingTime(card);
  if (!time || time >= now) return 1;

  const ageInDays = (now - time) / DAY_IN_MS;
  return Math.max(STALENESS_FLOOR, 1 - ageInDays / STALENESS_WINDOW_DAYS);
}

/**
 * Ranks by how much an item matters, discounted by age, with recency as a nudge
 * rather than the deciding factor.
 *
 * Recency used to be its own comparison step ahead of the score. Because
 * recencyScore is a continuous value derived from fractional days, two cards
 * essentially never tied, so the score was unreachable and the homepage was
 * ordered purely by date — which is how a department workplan overview outranked
 * an eight-story building approval.
 */
export function rankingScore(card: SummaryCardRow, now = Date.now()) {
  return publicInterestScore(card) * freshnessFactor(card, now) + recencyScore(card, now);
}

export function compareCardsByPublicInterest(left: SummaryCardRow, right: SummaryCardRow, now = Date.now()) {
  const leftTime = meetingTime(left);
  const rightTime = meetingTime(right);
  const leftFuture = leftTime >= now;
  const rightFuture = rightTime >= now;

  // Anything a reader can still act on comes first — that is the whole promise
  // of the product — but within each group, importance decides the order.
  if (leftFuture !== rightFuture) {
    return Number(rightFuture) - Number(leftFuture);
  }

  const rankDelta = rankingScore(right, now) - rankingScore(left, now);
  if (rankDelta !== 0) return rankDelta;
  if (leftFuture && rightFuture) return leftTime - rightTime;
  return rightTime - leftTime;
}

/**
 * Takes the top `limit` cards while allowing at most `perMeeting` from any single
 * meeting, so a short list spans several bodies and dates instead of turning into
 * one council agenda.
 *
 * Falls back to filling from the remainder if the cap cannot be satisfied.
 */
export function selectDiverseCards(
  cards: SummaryCardRow[],
  limit: number,
  perMeeting = 2
) {
  if (limit <= 0) return [] as SummaryCardRow[];

  const usedByMeeting = new Map<string, number>();
  const selected: SummaryCardRow[] = [];
  const deferred: SummaryCardRow[] = [];

  for (const card of cards) {
    if (selected.length >= limit) break;

    const key = card.meeting_id || card.meetings?.id || card.id;
    const used = usedByMeeting.get(key) || 0;

    if (used >= perMeeting) {
      deferred.push(card);
      continue;
    }

    usedByMeeting.set(key, used + 1);
    selected.push(card);
  }

  for (const card of deferred) {
    if (selected.length >= limit) break;
    selected.push(card);
  }

  return selected;
}

export function isDigestWorthyCard(card: SummaryCardRow) {
  return Boolean(card.outcome) || Boolean(card.is_featured) || isPublicInterestCard(card);
}

export function compareDigestCards(left: SummaryCardRow, right: SummaryCardRow, now = Date.now()) {
  const featuredDelta = Number(Boolean(right.is_featured)) - Number(Boolean(left.is_featured));
  if (featuredDelta !== 0) return featuredDelta;

  return compareCardsByPublicInterest(left, right, now);
}

export function selectDigestCards(cards: SummaryCardRow[], limit: number, now = Date.now()) {
  const digestWorthyCards = cards.filter(isDigestWorthyCard);
  const candidates = digestWorthyCards.length > 0 ? digestWorthyCards : cards;
  const ranked = [...candidates].sort((left, right) => compareDigestCards(left, right, now));
  const results = ranked.filter((card) => Boolean(card.outcome));
  const decisions = ranked.filter((card) => !card.outcome);
  if (results.length === 0 || decisions.length === 0) return ranked.slice(0, limit);

  const resultTarget = Math.ceil(limit / 2);
  const selectedResults = results.slice(0, resultTarget);
  const selectedDecisions = decisions.slice(0, limit - selectedResults.length);
  const remainingSlots = limit - selectedResults.length - selectedDecisions.length;
  const additionalResults = results.slice(
    selectedResults.length,
    selectedResults.length + remainingSlots
  );
  const selectedIds = new Set(
    [...selectedResults, ...selectedDecisions, ...additionalResults].map((card) => card.id)
  );

  return ranked.filter((card) => selectedIds.has(card.id)).slice(0, limit);
}

export function selectDigestCardGroups<
  TCard extends SummaryCardRow,
  TGroup extends { cards: TCard[] }
>(groups: TGroup[], limit: number, now = Date.now()) {
  if (limit <= 0) return [] as Array<TGroup & { cards: TCard[] }>;

  const groupsWithCards = groups
    .map((group) => ({
      group,
      cards: [...group.cards].sort((left, right) => compareDigestCards(left, right, now))
    }))
    .filter((entry) => entry.cards.length > 0);
  const selectedCardIds = new Set<string>();
  const selectedCardsByGroup = new Map<TGroup, TCard[]>();
  let selectedCardCount = 0;

  function addCard(group: TGroup, card: TCard) {
    if (selectedCardIds.has(card.id) || selectedCardCount >= limit) return false;
    selectedCardIds.add(card.id);
    selectedCardCount += 1;
    selectedCardsByGroup.set(group, [...(selectedCardsByGroup.get(group) || []), card]);
    return true;
  }

  const rankedGroups = groupsWithCards
    .map((entry) => ({
      ...entry,
      bestCard: entry.cards[0]
    }))
    .sort((left, right) => compareDigestCards(left.bestCard, right.bestCard, now));

  for (const { group, cards } of rankedGroups) {
    const firstUnselectedCard = cards.find((card) => !selectedCardIds.has(card.id));
    if (firstUnselectedCard) addCard(group, firstUnselectedCard);
    if (selectedCardCount >= limit) break;
  }

  const remainingCards = groupsWithCards
    .flatMap(({ group, cards }) => cards.map((card) => ({ group, card })))
    .filter(({ card }) => !selectedCardIds.has(card.id))
    .sort((left, right) => compareDigestCards(left.card, right.card, now));

  for (const { group, card } of remainingCards) {
    if (selectedCardCount >= limit) break;
    addCard(group, card);
  }

  return groupsWithCards
    .map(({ group }) => {
      const cards = selectedCardsByGroup.get(group) || [];
      return cards.length > 0 ? ({ ...group, cards } as TGroup & { cards: TCard[] }) : null;
    })
    .filter((group): group is TGroup & { cards: TCard[] } => Boolean(group));
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
