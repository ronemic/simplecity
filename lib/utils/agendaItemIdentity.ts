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
  "for",
  "get",
  "hoc",
  "of",
  "on",
  "receive",
  "review",
  "the",
  "to",
  "informational",
  "presentation",
  "discussion"
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
  const shared = leftTokens.filter((token) => rightTokens.includes(token)).length;
  return shared >= 3 && agendaItemSimilarity(left, right) >= 0.75;
}
