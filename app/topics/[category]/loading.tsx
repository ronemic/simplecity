export default function TopicDetailLoading() {
  return (
    <div className="section-shell py-10">
      <div className="max-w-3xl space-y-4">
        <div className="h-12 w-12 animate-pulse rounded-lg bg-black/10" />
        <div className="h-12 w-72 animate-pulse rounded-md bg-black/10" />
        <div className="h-6 w-full max-w-2xl animate-pulse rounded-md bg-black/10" />
      </div>
      <div className="mt-6 flex gap-2">
        <div className="h-10 w-20 animate-pulse rounded-lg bg-black/10" />
        <div className="h-10 w-24 animate-pulse rounded-lg bg-black/10" />
        <div className="h-10 w-20 animate-pulse rounded-lg bg-black/10" />
      </div>
      <div className="mt-8 space-y-4">
        <div className="h-60 animate-pulse rounded-lg bg-black/10" />
        <div className="h-60 animate-pulse rounded-lg bg-black/10" />
      </div>
    </div>
  );
}
