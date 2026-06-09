import Link from "next/link";

export default function NotFound() {
  return (
    <div className="section-shell py-10">
      <div className="quiet-card mx-auto max-w-xl p-6 text-center">
        <h1 className="text-2xl font-bold text-ink">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-black/65">
          The meeting or category may not exist yet, or it may not have been loaded from PrimeGov.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-10 items-center rounded-md bg-civic px-4 text-sm font-bold text-white"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
