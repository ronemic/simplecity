export default function Loading() {
  return (
    <div className="section-shell py-10">
      <div className="animate-pulse space-y-5">
        <div className="h-5 w-44 rounded-md bg-rule" />
        <div className="h-12 max-w-xl rounded-md bg-rule" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-52 rounded-lg bg-rule" />
          <div className="h-52 rounded-lg bg-rule" />
        </div>
      </div>
    </div>
  );
}
