export default function TopicsLoading() {
  return (
    <div className="section-shell py-10">
      <div className="max-w-3xl space-y-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-black/10" />
        <div className="h-12 w-96 max-w-full animate-pulse rounded-md bg-black/10" />
        <div className="h-6 w-full max-w-2xl animate-pulse rounded-md bg-black/10" />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="h-40 animate-pulse rounded-lg bg-black/10" />
        <div className="h-40 animate-pulse rounded-lg bg-black/10" />
        <div className="h-40 animate-pulse rounded-lg bg-black/10" />
        <div className="h-40 animate-pulse rounded-lg bg-black/10" />
      </div>
    </div>
  );
}
