export const CIVIC_TIME_ZONE = "America/Los_Angeles";

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

function normalizeYear(yearText: string) {
  const year = Number(yearText);
  return year < 100 ? 2000 + year : year;
}

function normalizeTime(hourText?: string, minuteText?: string, meridiemText?: string) {
  let hour = Number(hourText || 0);
  const minute = Number(minuteText || 0);
  const meridiem = meridiemText?.toLowerCase();

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return { hour, minute };
}

function parseCivicDateTimeParts(dateText: string): DateTimeParts | null {
  const normalized = dateText.replace(/\s+/g, " ").trim();
  const numericMatch = normalized.match(
    /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\D+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?)?/i
  );

  if (numericMatch) {
    const [, month, day, year, hour, minute, meridiem] = numericMatch;
    return {
      year: normalizeYear(year),
      month: Number(month),
      day: Number(day),
      ...normalizeTime(hour, minute, meridiem)
    };
  }

  const monthNameMatch = normalized.match(
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:\D+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?)?/i
  );

  if (monthNameMatch) {
    const [, monthName, day, year, hour, minute, meridiem] = monthNameMatch;
    const month = MONTH_INDEX[monthName.slice(0, 3).toLowerCase()];
    if (!month) return null;

    return {
      year: Number(year),
      month,
      day: Number(day),
      ...normalizeTime(hour, minute, meridiem)
    };
  }

  return null;
}

function getTimeZoneOffsetMs(date: Date, timeZone = CIVIC_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function civicDateTimePartsToIso(parts: DateTimeParts) {
  const localTimeAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let utcTime = localTimeAsUtc - getTimeZoneOffsetMs(new Date(localTimeAsUtc));
  utcTime = localTimeAsUtc - getTimeZoneOffsetMs(new Date(utcTime));
  return new Date(utcTime).toISOString();
}

function hasExplicitTimeZone(value: string) {
  return /(?:z|gmt|utc|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

export function parseMeetingDate(dateText?: string | null) {
  if (!dateText) return null;

  const normalized = dateText.replace(/\s+/g, " ").trim();
  const civicParts = parseCivicDateTimeParts(normalized);
  if (civicParts) return civicDateTimePartsToIso(civicParts);

  if (!hasExplicitTimeZone(normalized)) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseDisplayDate(value: string) {
  const parsedValue = parseMeetingDate(value) || value;
  const parsed = new Date(parsedValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDisplayDate(dateText?: string | null, iso?: string | null) {
  const value = iso || dateText;
  if (!value) return "Date not listed";

  const parsed = parseDisplayDate(value);
  if (!parsed) return dateText || value;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: CIVIC_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

export function formatCompactDisplayDate(dateText?: string | null, iso?: string | null) {
  const value = iso || dateText;
  if (!value) return "Date not listed";

  const parsed = parseDisplayDate(value);
  if (parsed) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: CIVIC_TIME_ZONE,
      month: "short",
      day: "numeric"
    }).format(parsed);
  }

  const compactMatch = value.match(/[A-Za-z]{3,9}\.?\s+\d{1,2}/);
  return compactMatch?.[0].replace(".", "") || value;
}
