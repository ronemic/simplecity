import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { CardTimeline } from "@/components/CardTimeline";
import { MarkFollowedCardSeen } from "@/components/MarkFollowedCardSeen";
import { SummaryCard } from "@/components/SummaryCard";
import { latestCardEventRecordedAt } from "@/lib/cardEvents";
import { getCardEvents, getPublishedCard } from "@/lib/db/queries";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { getPageLocale, getRequestLocale } from "@/lib/i18n/server";
import {
  cardShareDescription,
  cardShareTitle
} from "@/lib/utils/cardShare";
import { localizedSeoUrls, seoLocale, serializeJsonLd } from "@/lib/seo";

export const revalidate = 300;

export async function generateMetadata({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const locale = await getPageLocale(query.lang);
  const card = await getPublishedCard(id, locale);
  if (!card) {
    return { title: locale === "es" ? "Decisión no encontrada | SimpleCity" : "Card not found | SimpleCity" };
  }

  const title = `${cardShareTitle(card)} | SimpleCity`;
  const description = cardShareDescription(card, locale);
  const urls = localizedSeoUrls(`/cards/${encodeURIComponent(id)}`, seoLocale(query.lang));

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages },
    openGraph: {
      title,
      description,
      type: "article",
      url: urls.canonical,
      siteName: "SimpleCity"
    },
    twitter: { card: "summary", title, description }
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
  const events = await getCardEvents(card);
  const canonical = `${getConfiguredAppUrl()}/cards/${encodeURIComponent(id)}`;
  const title = cardShareTitle(card);
  const description = cardShareDescription(card, locale);
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: card.created_at || undefined,
    dateModified: card.updated_at || card.created_at || undefined,
    mainEntityOfPage: canonical,
    author: { "@type": "Organization", name: "SimpleCity" },
    publisher: { "@type": "Organization", name: "SimpleCity", url: getConfiguredAppUrl() },
    about: card.category_tags || undefined,
    isBasedOn: card.source_url || undefined
  };

  return (
    <div className="section-shell py-8 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }}
      />
      <div className="mx-auto max-w-[1120px]">
        <Link href="/decisions" className="action-link -ml-2">
          <ArrowLeft aria-hidden className="h-4 w-4" />
          {locale === "es" ? "Todas las decisiones" : "All decisions"}
        </Link>

        <div className="mt-4">
          <SummaryCard card={card} locale={locale} presentation="share" />
        </div>

        {events.length > 0 ? (
          <div className="quiet-card mt-4 px-6 py-5 sm:px-8">
            <CardTimeline events={events} locale={locale} />
          </div>
        ) : null}
        <MarkFollowedCardSeen cardId={card.id} seenThrough={latestCardEventRecordedAt(events)} />

      </div>
    </div>
  );
}
