import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { SummaryCard } from "@/components/SummaryCard";
import { getPublishedCard } from "@/lib/db/queries";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { getRequestLocale } from "@/lib/i18n/server";
import {
  cardShareDescription,
  cardShareTitle
} from "@/lib/utils/cardShare";

export const revalidate = 300;

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = await getPublishedCard(id, "en");
  if (!card) return { title: "Card not found | SimpleCity" };

  const title = `${cardShareTitle(card)} | SimpleCity`;
  const description = cardShareDescription(card, "en");
  const canonical = `${getConfiguredAppUrl()}/cards/${encodeURIComponent(id)}`;
  const image = `${canonical}/image`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "article",
      url: canonical,
      siteName: "SimpleCity",
      images: [{ url: image, width: 1200, height: 630, alt: cardShareTitle(card) }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image]
    }
  };
}

export default async function SharedCardPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, locale] = await Promise.all([params, getRequestLocale()]);
  const card = await getPublishedCard(id, locale);
  if (!card) notFound();

  return (
    <div className="section-shell py-8 sm:py-12">
      <div className="mx-auto max-w-[1120px]">
        <Link href="/decisions" className="action-link -ml-2">
          <ArrowLeft aria-hidden className="h-4 w-4" />
          {locale === "es" ? "Todas las decisiones" : "All decisions"}
        </Link>

        <div className="mt-4">
          <SummaryCard card={card} locale={locale} presentation="share" />
        </div>

      </div>
    </div>
  );
}
