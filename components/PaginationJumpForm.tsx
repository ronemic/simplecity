"use client";

import { type FormEvent, useId, useState } from "react";
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
  const inputId = useId();
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
      className="flex items-center gap-2 text-sm font-semibold text-black/70"
      onSubmit={handleSubmit}
    >
      <label htmlFor={inputId} className="hidden sm:inline">
        {locale === "es" ? "Página" : "Page"}
      </label>
      <div className="flex">
        <input
          id={inputId}
          aria-label={locale === "es" ? "Número de página" : "Page number"}
          className="h-10 w-14 rounded-l-lg border border-black/20 bg-white px-2 text-center text-sm font-bold tabular-nums text-ink shadow-sm transition [appearance:textfield] hover:border-black/30 focus:relative focus:z-10 focus:border-civic focus:outline-none focus:ring-4 focus:ring-civic/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          enterKeyHint="go"
          inputMode="numeric"
          max={pageCount}
          min={1}
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => event.target.select()}
          type="number"
          value={value}
        />
        <button
          type="submit"
          className="-ml-px h-10 rounded-r-lg border border-black/20 bg-white px-3 text-sm font-semibold text-ink shadow-sm transition hover:border-civic/25 hover:bg-[#f7fbff] focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic"
        >
          {locale === "es" ? "Ir" : "Go"}
        </button>
      </div>
      <span className="tabular-nums">{locale === "es" ? `de ${pageCount.toLocaleString("es")}` : `of ${pageCount.toLocaleString("en")}`}</span>
    </form>
  );
}
