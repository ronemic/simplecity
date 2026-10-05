"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";

export type ResultsFreshnessEntry = {
  slug: string;
  label: string;
  date: string | null;
};

export function ResultsFreshnessMenu({
  summary,
  entries,
  locale
}: {
  summary: string;
  entries: ResultsFreshnessEntry[];
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-sm font-bold text-civic hover:underline focus-visible:focus-ring"
      >
        {summary}
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="menu-popover !w-[min(20rem,calc(100vw-2rem))] px-3 py-2">
          <p className="pb-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-black/45">
            {locale === "es" ? "Resultados por lugar" : "Results by place"}
          </p>
          <dl>
            {entries.map((entry) => (
              <div
                key={entry.slug}
                className="flex items-baseline justify-between gap-3 border-t border-black/5 py-1.5"
              >
                <dt className="min-w-0 truncate font-bold text-ink">{entry.label}</dt>
                <dd className={entry.date ? "shrink-0 font-bold tabular-nums text-civic" : "shrink-0 font-medium text-black/40"}>
                  {entry.date ?? (locale === "es" ? "Aún no" : "Not yet")}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
