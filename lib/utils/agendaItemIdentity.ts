function normalizeAgendaItemText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bcapital improvement program\s*\(\s*cip\s*\)/g, "cip")
    .replace(/\bcapital improvement program\b/g, "cip")
    .replace(/\bpublic works\s*(?:and|&)\s*transportation commission\b/g, "pwtc")
    .replace(/\beast palo alto sanitary district\s*\(\s*epasd\s*\)/g, "epasd")
    .replace(/\beast palo alto sanitary district\b/g, "epasd")
    .replace(/\bsenate bill\b/g, "sb")
    .replace(/\brates?\b/g, "rate")
    .replace(/\bincreases?\b/g, "increase")
    .replace(/\bdisruptions?\b/g, "disruption")
    .replace(/\btemporar(?:y|ily)\b/g, " ")
    .replace(/\bwork[\s-]+plan\b/g, "workplan")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

const NON_IDENTITY_WORDS = new Set([
  "a",
  "ad",
  "advisory",
  "an",
  "and",
  "adoption",
  "annual",
  "approving",
  "change",
  "compliance",
  "conduct",
  "consider",
  "for",
  "get",
  "hoc",
  "hearing",
  "maximum",
  "near",
  "of",
  "on",
  "public",
  "receive",
  "resolution",
  "review",
  "the",
  "to",
  "vote",
  "with",
  "adjustments",
  "during",
  "in",
  "informational",
  "presentation",
  "discussion"
]);

const REWORDING_ONLY_WORDS = new Set([
  "accept",
  "approve",
  "consistency",
  "law",
  "replace",
  "state",
  "update"
]);

export function agendaItemIdentityTokens(value: string) {
  const tokens = normalizeAgendaItemText(value)
    .split(/\s+/)
    .filter((token) => token && !NON_IDENTITY_WORDS.has(token));
  return Array.from(new Set(tokens));
}

export function canonicalAgendaItemKey(value: string) {
  return agendaItemIdentityTokens(value).sort().join(" ");
}

export function agendaItemSimilarity(left: string, right: string) {
  const leftTokens = new Set(agendaItemIdentityTokens(left));
  const rightTokens = new Set(agendaItemIdentityTokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const shared = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

export function areLikelySameAgendaItem(left: string, right: string) {
  const leftKey = canonicalAgendaItemKey(left);
  const rightKey = canonicalAgendaItemKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;

  const leftTokens = agendaItemIdentityTokens(left);
  const rightTokens = agendaItemIdentityTokens(right);
  const leftNumbers = leftTokens.filter((token) => /\d/.test(token));
  const rightNumbers = rightTokens.filter((token) => /\d/.test(token));
  if (
    leftNumbers.length > 0 &&
    rightNumbers.length > 0 &&
    (leftNumbers.some((token) => !rightNumbers.includes(token)) ||
      rightNumbers.some((token) => !leftNumbers.includes(token)))
  ) {
    return false;
  }

  // Only accept a strict expansion of the shorter identity. Equal-length titles
  // with substituted subjects (for example, park vs. library contracts) are distinct.
  const [shorter, longer] =
    leftTokens.length < rightTokens.length
      ? [leftTokens, rightTokens]
      : [rightTokens, leftTokens];
  const sharedIdentityTokens = shorter.filter((token) => longer.includes(token)).length;
  const differingTokens = [
    ...leftTokens.filter((token) => !rightTokens.includes(token)),
    ...rightTokens.filter((token) => !leftTokens.includes(token))
  ];
  if (
    shorter.length >= 5 &&
    sharedIdentityTokens / shorter.length >= 0.8 &&
    differingTokens.every((token) => REWORDING_ONLY_WORDS.has(token))
  ) {
    return true;
  }
  if (shorter.length === longer.length || shorter.length < 3) return false;
  return shorter.every((token) => longer.includes(token));
}
