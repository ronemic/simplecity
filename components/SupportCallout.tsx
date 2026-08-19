import { ArrowRight } from "lucide-react";
import type { Locale } from "@/lib/i18n";

const DONATION_URL = "https://hcb.hackclub.com/donations/start/simplecity";

export function SupportCallout({ locale }: { locale: Locale }) {
  return (
    <section className="section-shell py-8">
      <div className="flex flex-col gap-4 border-t border-black/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-lg font-black text-ink">
            {locale === "es"
              ? "SimpleCity es gratis para todos"
              : "SimpleCity is free for everyone"}
          </h2>
          <p className="mt-1.5 text-[15px] font-medium leading-6 text-black/65">
            {locale === "es"
              ? "Y siempre lo será. Tu apoyo cubre el costo de agregar nuevas comunidades y mantener resúmenes confiables con enlaces a fuentes. Las donaciones son deducibles de impuestos."
              : "It always will be. Your support covers the cost of adding new communities and keeping summaries reliable and source-linked. Donations are tax-deductible."}
          </p>
        </div>
        <a
          href={DONATION_URL}
          target="_blank"
          rel="noreferrer"
          className="action-primary-sm w-fit shrink-0"
        >
          {locale === "es" ? "Apoya a SimpleCity" : "Support SimpleCity"}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}
