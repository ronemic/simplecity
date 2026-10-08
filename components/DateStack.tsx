import { cn } from "@/lib/utils/cn";

export type DateStackTone = "today" | "default";

/**
 * Month / day / weekday set as plain type. Shared by decision cards and the
 * meetings list so a date reads the same everywhere: today in civic blue,
 * every other date in ink.
 */
export function DateStack({
  month,
  day,
  weekday,
  tone = "default",
  size = "md",
  dateTime,
  title,
  className
}: {
  month: string;
  day: string | number;
  weekday?: string | null;
  tone?: DateStackTone;
  size?: "md" | "lg";
  dateTime?: string;
  title?: string;
  className?: string;
}) {
  return (
    <time dateTime={dateTime} title={title} className={cn("flex w-14 shrink-0 flex-col", className)}>
      <span
        className={cn(
          "text-xs font-bold uppercase leading-5 tracking-[0.08em]",
          tone === "today" ? "text-civic" : "text-black/50"
        )}
      >
        {month}
      </span>
      <span
        className={cn(
          "font-medium leading-none tabular-nums tracking-tight",
          size === "lg" ? "text-4xl" : "text-[1.75rem]",
          tone === "today" ? "text-civic" : "text-ink"
        )}
      >
        {day}
      </span>
      {weekday ? (
        <span className="mt-1 text-xs font-semibold text-black/50">
          {weekday}
        </span>
      ) : null}
    </time>
  );
}
