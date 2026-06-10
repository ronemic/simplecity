import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";

export function SearchAndFilters({
  resultCount,
  search = ""
}: {
  resultCount?: number;
  search?: string;
}) {
  const hasSearch = search.trim().length > 0;
  const resultLabel = resultCount === 1 ? "1 result" : `${resultCount ?? 0} results`;

  return (
    <div className="mx-auto w-full max-w-[940px]">
      <form
        className="mx-auto flex w-full max-w-[840px] flex-col gap-2 sm:flex-row sm:gap-0"
        action="/#search-results"
        role="search"
      >
        <label className="flex flex-1">
          <span className="sr-only">Search agenda cards</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="Search decisions, topics, meetings..."
            className="min-h-14 w-full rounded-lg border border-black/15 bg-white px-5 py-3 text-lg font-semibold text-ink shadow-sm transition placeholder:text-black/55 focus:border-civic focus:outline-none focus:ring-4 focus:ring-civic/15 sm:rounded-r-none"
          />
        </label>
        <button className="inline-flex min-h-14 items-center justify-center rounded-lg border border-black/25 bg-white px-6 py-3 text-lg font-bold text-ink shadow-sm transition hover:border-black/40 hover:bg-black/[0.025] focus-visible:focus-ring sm:-ml-px sm:rounded-l-none">
          Search
        </button>
      </form>

      {hasSearch ? (
        <div
          role="status"
          className="mx-auto mt-3 flex max-w-[840px] flex-col items-center justify-between gap-2 rounded-lg border border-civic/15 bg-[#eef5ff] px-4 py-3 text-sm font-semibold text-[#1646b8] sm:flex-row sm:text-left"
        >
          <span>
            Showing {resultLabel} for &ldquo;{search.trim()}&rdquo;.
          </span>
          <Link href="#search-results" className="rounded-md px-2 py-1 text-civic underline-offset-4 hover:underline focus-visible:focus-ring">
            View results
          </Link>
        </div>
      ) : null}

      <div className="mx-auto mt-3 grid max-w-[840px] gap-3 sm:mt-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Link
          href="/#decisions"
          className="inline-flex min-h-14 items-center justify-center gap-3 rounded-lg bg-civic px-6 py-3 text-lg font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#1c4788] hover:shadow-md focus-visible:focus-ring active:translate-y-px"
        >
          Review upcoming decisions
          <ArrowRight aria-hidden className="h-6 w-6" />
        </Link>
        <Link
          href="/meetings"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-black/20 bg-white px-6 py-3 text-lg font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-black/30 hover:bg-black/[0.025] hover:shadow-md focus-visible:focus-ring active:translate-y-px"
        >
          <CalendarDays aria-hidden className="h-5 w-5 text-civic" />
          Meeting calendar
        </Link>
      </div>
    </div>
  );
}
