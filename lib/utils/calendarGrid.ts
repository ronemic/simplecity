import type { Locale } from "@/lib/i18n";
import { CIVIC_TIME_ZONE } from "@/lib/utils/date";

export function dateKeyFromDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CIVIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function utcDateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateKeyFromUtcDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function addMonths(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isValidMonthKey(value?: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

export function isValidDateKey(value?: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function buildMonthDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1, 12));
  const firstGridDay = addDays(firstOfMonth, -firstOfMonth.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => dateKeyFromUtcDate(addDays(firstGridDay, index)));
}

export function isDateVisibleInMonthGrid(monthKey: string, dateKey?: string | null) {
  return isValidMonthKey(monthKey) && isValidDateKey(dateKey) && buildMonthDays(monthKey).includes(dateKey);
}

export function firstVisibleDateInMonthGrid(
  monthKey: string,
  ...dateKeys: Array<string | null | undefined>
) {
  if (!isValidMonthKey(monthKey)) return "";

  const visibleDates = new Set(buildMonthDays(monthKey));
  return dateKeys.find((dateKey) => isValidDateKey(dateKey) && visibleDates.has(dateKey)) || "";
}

export function firstDateInMonth(monthKey: string, ...dateKeys: Array<string | null | undefined>) {
  if (!isValidMonthKey(monthKey)) return "";

  return dateKeys.find((dateKey) => isValidDateKey(dateKey) && dateKey.startsWith(monthKey)) || "";
}

export function formatDateKey(key: string, options: Intl.DateTimeFormatOptions, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: CIVIC_TIME_ZONE,
    ...options
  }).format(utcDateFromKey(key));
}

export function weekdays(locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    weekday: "short",
    timeZone: CIVIC_TIME_ZONE
  });
  const firstSunday = new Date(Date.UTC(2024, 0, 7, 12));
  return Array.from({ length: 7 }, (_, index) => formatter.format(addDays(firstSunday, index)));
}
