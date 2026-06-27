import Link from "next/link";
import { type Locale, t } from "@/lib/i18n";

export function Footer({ locale = "en" }: { locale?: Locale }) {
  return (
    <footer className="mt-10 border-t border-black/10 bg-[#eef3f6]">
      <div className="section-shell grid gap-6 py-9 text-sm text-black/70 md:grid-cols-[1fr_auto] md:items-start">
        <div className="max-w-2xl space-y-3">
          <p className="font-semibold text-ink">SimpleCity</p>
          <p className="leading-6">
            {locale === "es"
              ? "SimpleCity es un sitio independiente compilado por ciudadanos privados, no un sitio oficial de la ciudad. Resume documentos de reuniones públicas para que sean más fáciles de entender. Siempre revisa la fuente original antes de tomar decisiones formales."
              : "SimpleCity is an independent site compiled by private citizens, not an official City website. It summarizes public meeting documents to make them easier to understand. Always review the original source before making formal decisions."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 font-bold">
          <Link className="action-ghost" href="/about">
            {t(locale, "about")}
          </Link>
          <Link className="action-ghost" href="/about">
            {t(locale, "sourceTransparency")}
          </Link>
          <a className="action-ghost" href="mailto:simplecityadmin@gmail.com">
            {t(locale, "contact")}
          </a>
        </div>
      </div>
    </footer>
  );
}
