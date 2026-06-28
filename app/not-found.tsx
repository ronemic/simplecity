import Link from "next/link";
import { t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export default async function NotFound() {
  const locale = await getRequestLocale();

  return (
    <div className="section-shell py-10">
      <div className="quiet-card mx-auto max-w-xl p-6 text-center">
        <h1 className="text-2xl font-bold text-ink">{t(locale, "pageNotFound")}</h1>
        <p className="mt-2 text-sm leading-6 text-black/75">
          {locale === "es"
            ? "Es posible que esta página no exista, haya cambiado de ubicación o ya no esté disponible."
            : "This page may not exist, may have moved, or may no longer be available."}
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-10 items-center rounded-md bg-civic px-4 text-sm font-bold text-white"
        >
          {t(locale, "goHome")}
        </Link>
      </div>
    </div>
  );
}
