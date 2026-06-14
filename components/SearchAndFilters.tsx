import { CalendarDays, Search } from "lucide-react";
import Link from "next/link";

export function SearchAndFilters({
  jurisdiction = "san-mateo",
  resultCount,
  search = ""
}: {
  jurisdiction?: string;
  resultCount?: number;
  search?: string;
}) {
  const hasSearch = search.trim().length > 0;
  const resultLabel = resultCount === 1 ? "1 result" : `${resultCount ?? 0} results`;

  return (
    <div className="w-full max-w-[740px]">
      <form
        className="flex w-full rounded-[10px] border border-white/20 bg-white/10 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur"
        action="/#search-results"
        role="search"
      >
        <label className="flex flex-1">
          <span className="sr-only">Search decisions, meetings, or topics</span>
          <input
            type="hidden"
            name="jurisdiction"
            value={jurisdiction}
          />
          <input
            name="q"
            defaultValue={search}
            placeholder="Search decisions"
            className="min-h-14 w-full rounded-lg rounded-r-none border border-transparent bg-white px-4 py-3 text-base font-semibold text-ink shadow-sm transition placeholder:text-black/[0.48] focus:border-[#89b8f7] focus:outline-none focus:ring-4 focus:ring-[#8fbfff]/25"
          />
        </label>
        <button
          aria-label="Search"
          className="-ml-px inline-flex min-h-14 w-16 shrink-0 items-center justify-center rounded-lg rounded-l-none bg-[#dcecff] px-4 py-3 text-base font-black text-[#102134] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8fbfff]/30"
        >
          <Search aria-hidden className="h-5 w-5" />
          <span className="sr-only">Search</span>
        </button>
      </form>

      {hasSearch ? (
        <div
          role="status"
          className="mt-3 flex flex-col items-start justify-between gap-2 rounded-lg border border-white/[0.16] bg-white/10 px-4 py-3 text-sm font-semibold text-[#e9f2ff] sm:flex-row"
        >
          <span>
            Showing {resultLabel} for &ldquo;{search.trim()}&rdquo;.
          </span>
          <Link href="#search-results" className="rounded-md py-1 text-[#b9d7ff] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#142234] sm:px-2">
            View results
          </Link>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold sm:mt-4 sm:items-center">
        <Link
          href={`/decisions?jurisdiction=${jurisdiction}`}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/[0.16] px-4 py-2 text-[#e7f0fb] transition hover:border-white/30 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#142234] sm:justify-start"
        >
          See current decisions
        </Link>
        <Link
          href={`/meetings?jurisdiction=${jurisdiction}`}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[#b9d7ff] transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#142234] sm:justify-start"
        >
          <CalendarDays aria-hidden className="h-4 w-4" />
          View meeting calendar
        </Link>
      </div>
    </div>
  );
}
