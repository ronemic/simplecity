export default function AdminLoading() {
  return (
    <div className="section-shell py-10">
      <div className="quiet-card mx-auto max-w-5xl p-6 sm:p-8">
        <div className="animate-pulse space-y-5">
          <div className="h-4 w-24 rounded-full bg-black/10" />
          <div className="h-10 w-80 rounded-md bg-black/10" />
          <div className="h-5 w-96 max-w-full rounded-md bg-black/10" />
          <div className="flex flex-wrap gap-2">
            <div className="h-10 w-28 rounded-md bg-black/10" />
            <div className="h-10 w-28 rounded-md bg-black/10" />
            <div className="h-10 w-28 rounded-md bg-black/10" />
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            <div className="h-24 rounded-lg bg-black/10" />
            <div className="h-24 rounded-lg bg-black/10" />
            <div className="h-24 rounded-lg bg-black/10" />
            <div className="h-24 rounded-lg bg-black/10" />
          </div>
          <div className="h-56 rounded-lg bg-black/10" />
          <div className="h-96 rounded-lg bg-black/10" />
        </div>
      </div>
    </div>
  );
}
