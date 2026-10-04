import type { Metadata } from "next";
import { FollowingList } from "@/components/FollowingList";
import { t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Following | SimpleCity",
  description: "Decisions you follow and what has changed since your last visit.",
  // Contents live in each reader's browser, so there is nothing to index.
  robots: { index: false, follow: true }
};

export default async function FollowingPage() {
  const locale = await getRequestLocale();

  return (
    <div className="section-shell py-8 sm:py-12">
      <div className="mx-auto max-w-[1120px]">
        <h1 className="text-3xl font-black text-ink sm:text-4xl">{t(locale, "following")}</h1>
        <p className="mt-2 max-w-2xl text-base font-medium leading-7 text-black/60">
          {locale === "es"
            ? "Las decisiones que sigues y lo que ha cambiado desde tu última visita."
            : "Decisions you follow and what has changed since your last visit."}
        </p>
        <div className="mt-6">
          <FollowingList locale={locale} />
        </div>
      </div>
    </div>
  );
}
