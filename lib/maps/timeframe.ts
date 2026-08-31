export const DECISION_MAP_TIMEFRAMES = ["3m", "12m", "all"] as const;

export type DecisionMapTimeframe = (typeof DECISION_MAP_TIMEFRAMES)[number];

export function normalizeDecisionMapTimeframe(value: string | null | undefined): DecisionMapTimeframe {
  return DECISION_MAP_TIMEFRAMES.includes(value as DecisionMapTimeframe)
    ? value as DecisionMapTimeframe
    : "12m";
}

export function decisionMapCutoff(
  timeframe: DecisionMapTimeframe,
  now = new Date()
): string | null {
  if (timeframe === "all") return null;
  const cutoff = new Date(now);
  const dayOfMonth = cutoff.getUTCDate();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - (timeframe === "3m" ? 3 : 12));
  // Subtracting months from the 29th to the 31st can land past the end of the
  // target month, and JS then rolls the overflow into the following one --
  // silently shortening the window. Day 0 backs up to the intended month's
  // last day, so the cutoff never moves later than the reader asked for.
  if (cutoff.getUTCDate() !== dayOfMonth) cutoff.setUTCDate(0);
  return cutoff.toISOString();
}
