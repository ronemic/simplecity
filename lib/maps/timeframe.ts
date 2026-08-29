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
  cutoff.setUTCMonth(cutoff.getUTCMonth() - (timeframe === "3m" ? 3 : 12));
  return cutoff.toISOString();
}
