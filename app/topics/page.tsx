import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CATEGORY_DEFINITIONS, CATEGORIES } from "@/lib/constants";
import { categoryDescription, categoryLabel, t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export default async function TopicsPage() {
  const locale = await getRequestLocale();

  return (
    <div className="section-shell py-10">
      <div className="mb-8 max-w-3xl">
        <p className="label-eyebrow text-civic">{t(locale, "topics")}</p>
        <h1 className="page-title mt-2">{t(locale, "everydayImpactTitle")}</h1>
        <p className="page-copy mt-3 text-base">
          {locale === "es"
            ? "SimpleCity etiqueta los puntos de la agenda según las partes de la vida diaria que probablemente afecten."
            : "SimpleCity tags agenda items by the parts of daily life they are most likely to affect."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((category) => {
          const definition = CATEGORY_DEFINITIONS[category];
          const Icon = definition.icon;
          return (
            <Link
              key={category}
              href={`/topics/${definition.slug}`}
              className="quiet-card interactive-card group block p-5 focus-visible:focus-ring"
            >
              <span className="icon-tile">
                <Icon aria-hidden className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-xl font-bold text-ink">{categoryLabel(locale, category)}</h2>
              <p className="mt-2 text-sm leading-6 text-black/70">{categoryDescription(locale, category)}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-civic">
                {t(locale, "viewCards")} <ArrowRight aria-hidden className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
