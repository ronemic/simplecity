export function parseMeetingDate(dateText?: string | null) {
  if (!dateText) return null;

  const normalized = dateText.replace(/\s+/g, " ").trim();
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function formatDisplayDate(dateText?: string | null, iso?: string | null) {
  const value = iso || dateText;
  if (!value) return "Date not listed";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return dateText || value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}
