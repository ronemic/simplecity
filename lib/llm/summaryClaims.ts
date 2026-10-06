/** Conservative contradiction checks, not a general semantic entailment judge.
 * Compare clauses about the same subject before checking their values/actions.
 */
const MONEY = /\$\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|thousand|bn|m|k)(?![a-z]))?/gi;
const STOP = new Set("a an the and or of for to in on at by with is are was were be been will would should may can must it its this that these those council city county board staff recommends recommend recommendation proposed proposes consider approve approved approval authorize authorized contract agreement costs cost total amount up not no has have had provides provide".split(" "));

function clauses(text: string) {
  return text.split(/\n|;|(?<=[.!?])\s+(?=[A-Z])|\s+and\s+(?=(?:the\s+)?\w+\s+contract)/).map((part) => part.trim()).filter(Boolean);
}

function subjectTokens(text: string) {
  return new Set(text.replace(MONEY, "").toLowerCase().match(/[a-z]{3,}/g)?.filter((word) => !STOP.has(word)) || []);
}

function overlap(left: Set<string>, right: Set<string>) {
  return [...left].filter((word) => right.has(word)).length;
}

const ACTION_PAIRS = [
  [/\b(?:eliminat\w*|discontinu\w*|end(?:s|ed)?)\b/i, /\b(?:expand\w*|continu\w*|maintain\w*)\b/i],
  [/\b(?:reduc\w*|decreas\w*)\b/i, /\b(?:increas\w*|expand\w*)\b/i],
  [/\b(?:prohibit\w*|ban(?:s|ned)?)\b/i, /\b(?:allow\w*|permit(?:s|ted)?)\b/i]
] as const;

export function summaryClaimIssue(
  summary: string,
  source: string,
  groundedValue: (value: string, source: string) => boolean = (value, evidence) => evidence.includes(value)
): string | null {
  const evidence = clauses(source);
  for (const claim of clauses(summary)) {
    const tokens = subjectTokens(claim);
    const candidates = evidence.map((text) => ({ text, score: overlap(tokens, subjectTokens(text)) }))
      .filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
    if (!candidates.length) continue;
    const strongest = candidates.filter((entry) => entry.score === candidates[0].score).map((entry) => entry.text);
    const amounts = claim.match(MONEY) || [];
    const monetaryEvidence = strongest.filter((text) => /\$\s*\d/.test(text));
    // Reject a misplaced amount only when a subject-matched source clause
    // actually gives an amount. Value presence elsewhere in the item is insufficient.
    if (monetaryEvidence.length && amounts.some((amount) => !monetaryEvidence.some((text) => groundedValue(amount, text)))) {
      return "A monetary claim assigns an amount to the wrong subject; preserve the source's contract/amount relationship.";
    }
    for (const amount of amounts) {
      const role = (text: string) => {
        const index = text.search(MONEY);
        if (index < 0) return null;
        const prefix = text.slice(Math.max(0, index - 65), index);
        return /(?:total|ceiling|not to exceed)\D{0,25}$/i.test(prefix) ? "total" :
          /(?:additional|increase(?: of| by)?|adds?)\D{0,25}$/i.test(prefix) ? "increase" : null;
      };
      const matched = monetaryEvidence.filter((text) => groundedValue(amount, text));
      // Compare unambiguous single-amount clauses; multi-amount sentences need
      // richer evidence than this deterministic guard can provide.
      const ownRole = amounts.length === 1 ? role(claim) : null;
      if (ownRole && matched.length && matched.every((text) =>
        (text.match(MONEY) || []).length === 1 && role(text) && role(text) !== ownRole)) {
        return "A spending claim confuses an increase with a total ceiling.";
      }
    }
    const negatedAction = /\b(?:not|never)\s+(?:be\s+)?(expand\w*|increas\w*|reduc\w*|eliminat\w*|allow\w*)\b/i;
    const negated = claim.match(negatedAction);
    if (negated && strongest.every((text) => text.toLowerCase().includes(negated[1].toLowerCase()) && !negatedAction.test(text))) {
      return "A claim negates the source's action for the same subject.";
    }
    if (!negated && strongest.every((text) => {
      const sourceNegation = text.match(negatedAction);
      return sourceNegation && claim.toLowerCase().includes(sourceNegation[1].toLowerCase());
    })) return "A claim omits the source's negation for the same subject.";
    for (const [left, right] of ACTION_PAIRS) {
      const claimed = left.test(claim) ? left : right.test(claim) ? right : null;
      const opposite = claimed === left ? right : left;
      if (claimed && strongest.every((text) => opposite.test(text) && !claimed.test(text))) {
        return "A claim reverses the source's action for the same subject.";
      }
    }
    if (/\b(?:approved|adopted|authorized)\b/i.test(claim) &&
        !/\b(?:not|never|proposed|recommended|would|if)\b/i.test(claim) &&
        strongest.every((text) => /\b(?:not approved|not adopted|not authorized|propos\w*|recommend\w*|consider\w*)\b/i.test(text) &&
          !/\b(?:voted|carried|passed)\b/i.test(text))) {
      return "A claim describes a proposed or unapproved action as an approval.";
    }
    if (/\bnot\s+(?:approved|adopted|authorized)\b/i.test(claim) &&
        strongest.every((text) => /\b(?:approved|adopted|authorized)\b/i.test(text) && !/\b(?:not|never)\b/i.test(text))) {
      return "A claim adds negation to the source's approval.";
    }
    const deadline = claim.match(/\b(?:by|before|until|deadline(?: is| of|:)?)\s+((?:Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s+\d{1,2}(?:,?\s+\d{4})?)/i);
    if (deadline && strongest.some((text) => /\b(?:by|before|until|deadline)\b/i.test(text)) &&
        !strongest.some((text) => groundedValue(deadline[1], text))) {
      return "A deadline is assigned to the wrong subject.";
    }
  }
  const spendingClaims = clauses(summary).filter((text) => /\$\s*\d/.test(text));
  if (spendingClaims.length) {
    const spendingEvidence = evidence.flatMap((text, index) => {
      const amounts = text.match(MONEY) || [];
      return amounts.length ? [{ text, index, matched: spendingClaims.some((claim) =>
        overlap(subjectTokens(claim), subjectTokens(text)) > 0 &&
        (claim.match(MONEY) || []).some((amount) => groundedValue(amount, text))
      ) }] : [];
    });
    const spendingTopics = subjectTokens(spendingClaims.join(" "));
    for (const [index, rawText] of evidence.entries()) {
      const text = rawText.split(
        /\s+(?:which|that)\b|,\s*(?:with|where|when|and)\b|\s+and\s+(?:(?:it|work|construction|the project)\s+)?(?:will|is|was|has|starts?|begins?)\b/i
      )[0];
      if (!/\b(?:reimburse\w*|reimbursable|funded|paid for|financed)\b/i.test(text)) continue;
      // An explicit different expense overrides proximity. Generic references
      // ("it", "the contract", "both amendments") inherit only the preceding
      // monetary clause, so a neighboring item's reimbursement cannot leak in.
      const references = [...text.matchAll(/((?:[\w'-]+\s+){0,3})(?:contracts?|amendments?|projects?|agreements?|purchases?)\b/gi)];
      const referenceWords = references.flatMap((match) => [...subjectTokens(match[1])])
        .filter((word) => !["previous", "prior", "earlier", "historical", "new", "both", "reimburse", "reimburses", "reimbursed"].includes(word));
      const applies = referenceWords.length
        ? referenceWords.some((word) => spendingTopics.has(word))
        : spendingEvidence.filter((entry) => entry.index <= index).at(-1)?.matched;
      if (!applies) continue;
      if (/\b(?:reimburse\w*|reimbursable)\b/i.test(text) &&
          !/\b(?:reimburse\w*|reimbursable|paid (?:back|by)|repay\w*)\b/i.test(summary)) {
        return "Spending summary omits the source's material reimbursement qualifier and who pays.";
      }
      const reimbursement = text.match(/^(.{1,120}?)\s+(?:will\s+)?reimburse(?:s)?\b/i) ||
        text.match(/\breimbursed\s+by\s+(.{1,120}?)(?:[.;]|$)/i);
      const funding = text.match(/\b(?:funded|paid for|financed)\s+(?:by|from|through|with)\s+(.{1,120}?)(?:[.;]|$)/i);
      const payer = reimbursement?.[1] || funding?.[1];
      if (!payer) continue;
      const names = (payer.toLowerCase().match(/[a-z]{3,}/g) || [])
        .filter((word) => !["the", "both", "these", "amendments", "will", "funds", "funding"].includes(word));
      if (!names.length) continue;
      const summaryWords = new Set(summary.toLowerCase().match(/[a-z]{3,}/g) || []);
      if (!names.every((name) => summaryWords.has(name))) {
        return "Spending summary omits or changes an explicitly named payer or funding source.";
      }
    }
  }
  return null;
}
