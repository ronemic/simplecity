export function SearchAndFilters({
  search = ""
}: {
  search?: string;
}) {
  return (
    <form
      className="mx-auto flex w-full max-w-[840px] flex-col gap-2 sm:flex-row sm:gap-0"
      action="/"
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
  );
}
