"use client";

import { type FormEvent, useState } from "react";
import type { Locale } from "@/lib/i18n";

export function PaginationJumpForm({
  page,
  pageCount,
  locale,
  onPageChange
}: {
  page: number;
  pageCount: number;
  locale: Locale;
  onPageChange: (page: number) => void;
}) {
  const [value, setValue] = useState(String(page));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const requestedPage = Number.parseInt(value, 10);
    const nextPage = Number.isFinite(requestedPage)
      ? Math.min(pageCount, Math.max(1, requestedPage))
      : page;

    setValue(String(nextPage));
    if (nextPage === page) return;
    onPageChange(nextPage);
  }

  return (
    <form
      className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold text-black/60"
      onSubmit={handleSubmit}
    >
      <label className="inline-flex items-center gap-2">
        <span>{locale === "es" ? "Página" : "Page"}</span>
        <input
          aria-label={locale === "es" ? "Número de página" : "Page number"}
          className="h-9 w-16 rounded-lg border border-black/15 bg-white px-2 text-center text-sm font-black text-ink shadow-sm focus:border-civic focus:outline-none focus:ring-4 focus:ring-civic/15"
          inputMode="numeric"
          max={pageCount}
          min={1}
          onChange={(event) => setValue(event.target.value)}
          type="number"
          value={value}
        />
      </label>
      <span>{locale === "es" ? `de ${pageCount}` : `of ${pageCount}`}</span>
      <button
        className="action-secondary-sm min-h-9 px-3 py-1.5"
        type="submit"
      >
        {locale === "es" ? "Ir" : "Go"}
      </button>
    </form>
  );
}
