"use client";

import { RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="section-shell py-10">
      <div className="quiet-card mx-auto max-w-xl p-6 text-center">
        <h1 className="text-2xl font-bold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-black/75">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-civic px-4 text-sm font-bold text-white"
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
