export default function MeetingsLoading() {
  return (
    <div className="section-shell py-10">
      <div className="max-w-3xl space-y-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-black/10" />
        <div className="h-12 w-96 max-w-full animate-pulse rounded-md bg-black/10" />
        <div className="h-6 w-full max-w-2xl animate-pulse rounded-md bg-black/10" />
      </div>
      <div className="mt-6 space-y-4">
        <div className="h-20 animate-pulse rounded-lg bg-black/10" />
        <div className="h-20 animate-pulse rounded-lg bg-black/10" />
        <div className="h-20 animate-pulse rounded-lg bg-black/10" />
      </div>
    </div>
  );
}
