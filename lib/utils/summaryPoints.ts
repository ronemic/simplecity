export type SummaryPointsValue = string[] | string | null | undefined;

function legacyJsonSummaryPoints(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) && parsed.every((point) => typeof point === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function normalizeSummaryPoints(value: SummaryPointsValue) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? legacyJsonSummaryPoints(value) || value.split(/\r?\n/)
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
