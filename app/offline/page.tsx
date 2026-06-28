import Link from "next/link";
import { Home, Newspaper, WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Offline | SimpleCity",
  description: "SimpleCity offline fallback."
};

export default async function OfflinePage() {
  const locale = await getRequestLocale();
  const isSpanish = locale === "es";

  return (
    <div className="section-shell py-10 sm:py-14">
      <section className="quiet-card mx-auto max-w-2xl p-6 sm:p-8">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-civic text-white">
          <WifiOff aria-hidden="true" className="h-6 w-6" />
        </div>
        <p className="label-eyebrow text-civic">{isSpanish ? "Sin conexión" : "Offline"}</p>
        <h1 className="page-title mt-2">
          {isSpanish
            ? "Necesitas conexión para ver los datos cívicos más recientes."
            : "Connection needed for the latest civic data."}
        </h1>
        <p className="page-copy mt-4 text-base">
          {isSpanish
            ? "SimpleCity puede mostrar páginas que abriste antes, pero las nuevas decisiones, reuniones y detalles para comentar necesitan una conexión activa."
            : "SimpleCity may still show pages you opened earlier, but new decisions, meetings, and comment details need a live connection."}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link className="action-primary" href="/">
            <Home aria-hidden="true" className="h-4 w-4" />
            {t(locale, "goHome")}
          </Link>
          <Link className="action-secondary" href="/decisions">
            <Newspaper aria-hidden="true" className="h-4 w-4" />
            {t(locale, "decisions")}
          </Link>
        </div>
      </section>
    </div>
  );
}
