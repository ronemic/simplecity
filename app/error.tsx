"use client";

import { RotateCcw } from "lucide-react";
import { t } from "@/lib/i18n";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = typeof document !== "undefined" && document.documentElement.lang === "es" ? "es" : "en";

  return (
    <div className="section-shell py-10">
      <div className="quiet-card mx-auto max-w-xl p-6 text-center">
        <h1 className="text-2xl font-bold text-ink">
          {locale === "es" ? "Algo salió mal" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-black/75">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="action-primary-sm mt-5"
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          {t(locale, "tryAgain")}
        </button>
      </div>
    </div>
  );
}
