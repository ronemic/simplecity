import { cardEventLabel, formatCardEventDate, type CardEvent } from "@/lib/cardEvents";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

export function CardTimeline({
  events,
  locale,
  newEventIds,
  title
}: {
  events: CardEvent[];
  locale: Locale;
  newEventIds?: ReadonlySet<string>;
  title?: string;
}) {
  if (events.length === 0) return null;

  return (
    <section aria-label={title || (locale === "es" ? "Historial" : "Timeline")}>
      <p className="text-xs font-black uppercase text-black/[0.55]">
        {title || (locale === "es" ? "Historial" : "Timeline")}
      </p>
      <ol className="mt-3 border-l-2 border-black/10 pl-4">
        {events.map((event) => {
          const isNew = newEventIds?.has(event.id);
          return (
            <li key={event.id} className="relative pb-3 last:pb-0">
              <span
                aria-hidden
                className={cn(
                  "absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white",
                  isNew ? "bg-civic" : "bg-black/30"
                )}
              />
              <p className="text-sm font-bold leading-5 text-ink">
                {cardEventLabel(event, locale)}
                {isNew ? (
                  <span className="ml-2 align-middle text-[0.68rem] font-black uppercase tracking-[0.06em] text-civic">
                    {locale === "es" ? "Nuevo" : "New"}
                  </span>
                ) : null}
              </p>
              <p className="text-xs font-semibold text-black/50">
                {formatCardEventDate(event.occurred_at, locale)}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
