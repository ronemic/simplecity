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
  const meridiem = meridiemText?.toLowerCase().replace(/[^apm]/g, "");

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return { hour, minute };
}

/**
 * A clock time with an explicit meridiem. Seconds are optional and ignored —
 * Redwood City's portal emits "1:00:00 PM", and a pattern that expected the
 * meridiem right after the minutes silently dropped the PM, storing 1pm council
 * meetings as 1am.
 */
// The meridiem group deliberately spans both letters ("p. m" as well as "pm"),
// because normalizeTime compares against the full "am"/"pm" after stripping
// punctuation — capturing only the leading letter silently disables it.
const MERIDIEM_TIME_PATTERN = /\b(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([AP]\.?\s*M)\.?/i;

/** A 24-hour clock time. Requires minutes, so a bare number is not a time. */
const TWENTY_FOUR_HOUR_TIME_PATTERN = /\b(\d{1,2}):(\d{2})(?::\d{2})?\b/;

/**
 * Pulls a clock time out of the text following a date.
 *
 * Requires either a meridiem or `:mm`, so unrelated trailing numbers — room
 * numbers, districts, agenda item counts — are not mistaken for the hour. The
 * previous pattern used `\D+` to skip to "the next number", which meant
 * "Aug 13, 2026 - Council Chambers 2" parsed as 2:00 am.
 */
function extractCivicTime(text: string) {
  const meridiemMatch = text.match(MERIDIEM_TIME_PATTERN);
  if (meridiemMatch) {
    const [, hour, minute, meridiem] = meridiemMatch;
    return normalizeTime(hour, minute, meridiem);
  }

  const twentyFourHourMatch = text.match(TWENTY_FOUR_HOUR_TIME_PATTERN);
  if (twentyFourHourMatch) {
    const [, hour, minute] = twentyFourHourMatch;
    return normalizeTime(hour, minute);
  }

  return { hour: 0, minute: 0 };
}

function parseCivicDateTimeParts(dateText: string): DateTimeParts | null {
  const normalized = dateText.replace(/\s+/g, " ").trim();

  const numericMatch = normalized.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (numericMatch) {
    const [, month, day, year] = numericMatch;
    const afterDate = normalized.slice((numericMatch.index || 0) + numericMatch[0].length);
    return {
      year: normalizeYear(year),
      month: Number(month),
      day: Number(day),
      ...extractCivicTime(afterDate)
    };
  }

  const monthNameMatch = normalized.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthNameMatch) {
    const [, monthName, day, year] = monthNameMatch;
    const month = MONTH_INDEX[monthName.slice(0, 3).toLowerCase()];
    if (!month) return null;

    const afterDate = normalized.slice((monthNameMatch.index || 0) + monthNameMatch[0].length);
    return {
      year: Number(year),
      month,
      day: Number(day),
      ...extractCivicTime(afterDate)
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

export function hasExplicitClockTime(value?: string | null) {
  return /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(String(value || ""));
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

function civicClockParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CIVIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

export function hasDisplayableMeetingTime(
  dateText?: string | null,
  iso?: string | null,
  timeText?: string | null
) {
  if (hasExplicitClockTime(dateText) || hasExplicitClockTime(timeText)) return true;
  if (!iso) return false;

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;

  const clock = civicClockParts(parsed);
  return clock.hour !== 0 || clock.minute !== 0;
}

/**
 * The start time alone — "6:00 PM" — or null when the meeting has no real one.
 *
 * Stricter than `hasDisplayableMeetingTime`: that helper trusts a clock time
 * found in `date_text`/`time_text` even when `meeting_datetime` was stored as
 * midnight, which is the right call when the date carries the answer anyway.
 * A bare time has no such cover — printing "12:00 AM" would state a wrong hour
 * with no context to correct it — so this returns null unless the timestamp
 * itself holds a non-midnight civic clock.
 */
export function meetingClockTime(iso?: string | null, locale: "en" | "es" = "en") {
  if (!iso) return null;

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  const clock = civicClockParts(parsed);
  if (clock.hour === 0 && clock.minute === 0) return null;

  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: CIVIC_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

export function formatDisplayDate(
  dateText?: string | null,
  iso?: string | null,
  timeText?: string | null,
  locale: "en" | "es" = "en"
) {
  const value = iso || dateText;
  if (!value) return locale === "es" ? "Fecha no indicada" : "Date not listed";

  const parsed = parseDisplayDate(value);
  if (!parsed) return dateText || value;

  const options: Intl.DateTimeFormatOptions = {
    timeZone: CIVIC_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric"
  };

  if (hasDisplayableMeetingTime(dateText, iso, timeText)) {
    options.hour = "numeric";
    options.minute = "2-digit";
  }

  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", options).format(parsed);
}

export function formatCompactDisplayDate(
  dateText?: string | null,
  iso?: string | null,
  locale: "en" | "es" = "en"
) {
  const value = iso || dateText;
  if (!value) return locale === "es" ? "Fecha no indicada" : "Date not listed";

  const parsed = parseDisplayDate(value);
  if (parsed) {
    return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
      timeZone: CIVIC_TIME_ZONE,
      month: "short",
      day: "numeric"
    }).format(parsed);
  }

  const compactMatch = value.match(/[A-Za-z]{3,9}\.?\s+\d{1,2}/);
  return compactMatch?.[0].replace(".", "") || value;
}

function civicDayStamp(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CIVIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

/**
 * Source records carry a start time but never an end time, so "is this meeting
 * over?" has to assume a length. Three hours covers a typical council or
 * commission session; a meeting inside that window still counts as current
 * rather than past.
 */
const ASSUMED_MEETING_DURATION_MS = 3 * 60 * 60 * 1000;

/**
 * The Pacific calendar day of a meeting as `YYYY-MM-DD`.
 *
 * Use this for any "same day?" comparison instead of slicing a parsed ISO string.
 * `parseMeetingDate(...).slice(0, 10)` yields the *UTC* day, so an evening Pacific
 * meeting reports the following date — a 6pm council meeting on Jun 8 came back as
 * "2026-06-09" and stopped matching its own minutes.
 */
export function civicCalendarDay(dateText?: string | null, iso?: string | null) {
  const value = iso || dateText;
  if (!value) return null;

  const parsed = parseDisplayDate(value);
  if (!parsed) return null;

  return civicDayStamp(parsed);
}

/**
 * Whether a meeting is still worth showing as current — either it has not
 * started, or it started recently enough to plausibly still be in session.
 *
 * Records with a clock time are compared instant-to-instant, so a 9am meeting
 * stops counting by lunchtime instead of lingering all day. Records with only a
 * date fall back to a Pacific calendar-day comparison, which is the most that
 * can honestly be claimed about them.
 *
 * Scraped `status` fields go stale — records keep saying "Upcoming" months after
 * the meeting, and the one meeting happening today said "Past" — so anything
 * user-facing should ask this instead of trusting that column.
 */
export function isUpcomingMeetingDate(
  dateText?: string | null,
  iso?: string | null,
  timeText?: string | null
) {
  const value = iso || dateText;
  if (!value) return false;

  const parsed = parseDisplayDate(value);
  if (!parsed) return false;

  if (!hasDisplayableMeetingTime(dateText, iso, timeText)) {
    return civicDayStamp(parsed) >= civicDayStamp(new Date());
  }

  return parsed.getTime() + ASSUMED_MEETING_DURATION_MS > Date.now();
}

/**
 * Whether a meeting has started but is probably still going, so the UI can say
 * "in progress" rather than "next". Only meaningful for records that carry a
 * clock time; a date-only record can never be pinpointed this precisely.
 */
export function isMeetingInProgress(
  dateText?: string | null,
  iso?: string | null,
  timeText?: string | null
) {
  const value = iso || dateText;
  if (!value) return false;
  if (!hasDisplayableMeetingTime(dateText, iso, timeText)) return false;

  const parsed = parseDisplayDate(value);
  if (!parsed) return false;

  const startedAt = parsed.getTime();
  const now = Date.now();
  return startedAt <= now && now < startedAt + ASSUMED_MEETING_DURATION_MS;
}

/**
 * Month and day split apart for the docket date rail. Returns null when the
 * source record has no parseable date, so callers can fall back rather than
 * render a placeholder day number.
 */
export function meetingDateParts(
  dateText?: string | null,
  iso?: string | null,
  locale: "en" | "es" = "en"
) {
  const value = iso || dateText;
  if (!value) return null;

  const parsed = parseDisplayDate(value);
  if (!parsed) return null;

  const intlLocale = locale === "es" ? "es-US" : "en-US";

  return {
    month: new Intl.DateTimeFormat(intlLocale, {
      timeZone: CIVIC_TIME_ZONE,
      month: "short"
    })
      .format(parsed)
      .replace(".", ""),
    day: new Intl.DateTimeFormat(intlLocale, {
      timeZone: CIVIC_TIME_ZONE,
      day: "numeric"
    }).format(parsed),
    year: new Intl.DateTimeFormat(intlLocale, {
      timeZone: CIVIC_TIME_ZONE,
      year: "numeric"
    }).format(parsed),
    iso: parsed.toISOString()
  };
}

export function formatPacificTimestamp(value?: string | null, locale: "en" | "es" = "en") {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: CIVIC_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed)} PT`;
}
