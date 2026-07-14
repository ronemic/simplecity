export type SummaryPointsValue = string[] | string | null | undefined;

export function normalizeSummaryPoints(value: SummaryPointsValue) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];

  return values
    .map((point) => point.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function summaryPointsText(value: SummaryPointsValue) {
  return normalizeSummaryPoints(value).join(" ");
}

export function summaryPointsStorageText(value: SummaryPointsValue) {
  return normalizeSummaryPoints(value).join("\n");
}

export function summaryPointsFromLines(value: unknown) {
  const values = Array.isArray(value) ? value.map(String) : String(value || "").split(/\r?\n/);
  return normalizeSummaryPoints(values);
}
