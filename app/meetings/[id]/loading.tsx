export default function MeetingDetailLoading() {
  return (
    <div className="section-shell py-10">
      <div className="max-w-4xl space-y-4">
        <div className="h-5 w-28 animate-pulse rounded-full bg-black/10" />
        <div className="h-14 w-3/4 animate-pulse rounded-md bg-black/10" />
        <div className="h-6 w-1/2 animate-pulse rounded-md bg-black/10" />
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="h-8 w-52 animate-pulse rounded-md bg-black/10" />
          <div className="h-72 animate-pulse rounded-lg bg-black/10" />
          <div className="h-72 animate-pulse rounded-lg bg-black/10" />
        </div>
        <div className="space-y-4">
          <div className="h-56 animate-pulse rounded-lg bg-black/10" />
          <div className="h-40 animate-pulse rounded-lg bg-black/10" />
          <div className="h-32 animate-pulse rounded-lg bg-black/10" />
        </div>
      </div>
    </div>
  );
}
