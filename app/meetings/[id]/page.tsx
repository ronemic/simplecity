import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, FileText } from "lucide-react";
import { AddToGoogleCalendarLink } from "@/components/AddToGoogleCalendarLink";
import { MeetingVideoEmbed } from "@/components/MeetingVideoEmbed";
import { SummaryCard } from "@/components/SummaryCard";
import { StatusPill } from "@/components/StatusPill";
import {
  getAdjacentMeetingsForMeeting,
  getMeetingDetail,
  getMeetingRawVideoDocuments
} from "@/lib/db/queries";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionDisplayLabel,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { cookies } from "next/headers";
import { displayMeetingTitle, displayMeetingType } from "@/lib/utils/meetingDisplay";
import { displayDocumentLabel, displayDocumentType } from "@/lib/utils/documentDisplay";
import { formatDisplayDate } from "@/lib/utils/date";
import { getEmbeddableVideoDocuments, getVideoLinkUrl } from "@/lib/utils/videoEmbed";
import { t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { serializeJsonLd } from "@/lib/seo";
import type { DecisionOutcome, SummaryCardRow } from "@/lib/types";

export const revalidate = 300;

const MENLO_PARK_MAY_12_MINUTES_URL =
  "https://www.menlopark.gov/files/sharedassets/public/v/1/agendas-and-minutes/city-council/2026-meetings/minutes/20260512-city-council-regular-minutes-approved.pdf";
const MENLO_PARK_MAY_12_DECIDED_AT = "2026-05-12T18:00:00-07:00";

const MENLO_PARK_MAY_12_OUTCOME_PREVIEW = {
  queryValue: "menlo-park-may-12-2026",
  meetingId: "f14bb7d0-b975-490d-9d97-44591819e383",
  outcomesByOriginalCardId: {
    "d1a3ee43-85f4-41f1-a2c4-ef1d1dcf6125": {
      kind: "approved",
      headline: "Passed unanimously",
      summary: "The City Council approved this item as part of the consent calendar.",
      vote: "Unanimous"
    },
    "e0546e83-becf-431b-9235-76d9ea6a155c": {
      kind: "approved",
      headline: "Passed unanimously",
      summary: "The City Council approved this item as part of the consent calendar.",
      vote: "Unanimous"
    },
    "8e619b41-c520-47e1-a788-1261f64a2e37": {
      kind: "approved",
      headline: "Passed unanimously",
      summary: "The City Council approved this item as part of the consent calendar.",
      vote: "Unanimous"
    },
    "1cdbecbc-a4e4-4f87-afe8-f3d1ed7c2ce2": {
      kind: "approved",
      headline: "Passed unanimously",
      summary: "The City Council approved this item as part of the consent calendar.",
      vote: "Unanimous"
    },
    "7a6e4a3b-8f47-4f6b-9910-71dc859c00e5": {
      kind: "other",
      headline: "Direction provided",
      summary:
        "The City Council directed staff to assess staffing and deployment, strengthen recruitment and field training, continue data-driven crime prevention, and make targeted technology and accountability improvements.",
      next_step: "Staff will use the direction to shape the fiscal year 2026-27 public safety priority."
    },
    "d5b7b717-1245-4b30-9e27-15b42f4b61bc": {
      kind: "other",
      headline: "Direction provided",
      summary:
        "The City Council directed staff on capital-plan funding, project delays and cancellation, budget reductions, quiet-zone funding, and adding the Sharon Park Pond Pump Station replacement.",
      next_step: "Staff will incorporate the direction into the five-year capital improvement plan."
    },
    "43cddd16-b096-407d-b9d2-72aceef86e54": {
      kind: "continued",
      headline: "Continued to June 9",
      summary:
        "The City Council continued the solid-waste rate public hearing by acclamation to June 9, 2026, at 6 p.m. No final rate decision was made at this meeting.",
      vote: "By acclamation",
      next_step: "The public hearing resumes June 9, 2026, at 6 p.m."
    },
    "b311b88a-123f-40b1-bc31-3023f703ad35": {
      kind: "continued",
      headline: "Continued to June 9",
      summary:
        "The City Council continued the municipal-water rate public hearing by acclamation to June 9, 2026, at 6 p.m. No final rate decision was made at this meeting.",
      vote: "By acclamation",
      next_step: "The public hearing resumes June 9, 2026, at 6 p.m."
    },
    "3b29c0d9-2796-4996-b4e7-e1356082220b": {
      kind: "other",
      headline: "No action taken",
      summary:
        "The City Council took no action on the temporary Senate Bill 79 zoning-map exclusion and directed staff to keep the council advised of applications submitted under SB 79.",
      next_step: "Staff will keep the City Council advised of SB 79 applications."
    }
  } satisfies Record<string, Omit<DecisionOutcome, "decided_at" | "source_url">>
} as const;

function outcomeForLocalPreview(
  card: SummaryCardRow,
  meetingId: string,
  requestedPreview: string | undefined
) {
  if (card.outcome) return card.outcome;
  if (
    process.env.NODE_ENV !== "development" ||
    requestedPreview !== MENLO_PARK_MAY_12_OUTCOME_PREVIEW.queryValue ||
    meetingId !== MENLO_PARK_MAY_12_OUTCOME_PREVIEW.meetingId
  ) {
    return null;
  }

  const outcome =
    MENLO_PARK_MAY_12_OUTCOME_PREVIEW.outcomesByOriginalCardId[
      card.id as keyof typeof MENLO_PARK_MAY_12_OUTCOME_PREVIEW.outcomesByOriginalCardId
    ];
  if (!outcome) return null;

  return {
    ...outcome,
    decided_at: MENLO_PARK_MAY_12_DECIDED_AT,
    source_url: MENLO_PARK_MAY_12_MINUTES_URL
  } satisfies DecisionOutcome;
}

export async function generateMetadata({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ jurisdiction?: string; previewOutcome?: string }>;
}): Promise<Metadata> {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const jurisdiction = normalizeJurisdictionSelection(query.jurisdiction);
  const { meeting } = await getMeetingDetail(id, jurisdiction, "en");
  if (!meeting) return { title: "Meeting not found | SimpleCity", robots: { index: false } };

  const jurisdictionSlug = toPublicJurisdictionSlug(jurisdiction);
  const jurisdictionLabel = getJurisdictionDisplayLabel(
    meeting.jurisdiction_slug || meeting.jurisdiction_name
  );
  const meetingTitle = displayMeetingTitle(meeting, "Public meeting", "en");
  const date = formatDisplayDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text);
  const title = `${meetingTitle} - ${jurisdictionLabel} | SimpleCity`;
  const description = `${meetingTitle} on ${date}. View the agenda, official documents, and plain-English decision summaries from ${jurisdictionLabel}.`;
  const canonicalUrl = new URL(`/meetings/${encodeURIComponent(id)}`, getConfiguredAppUrl());
  canonicalUrl.searchParams.set("jurisdiction", jurisdictionSlug);

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl.toString() },
    openGraph: {
      title,
      description,
      type: "article",
      url: canonicalUrl.toString(),
      siteName: "SimpleCity"
    },
    twitter: { card: "summary", title, description }
  };
}

function meetingHref(meetingId: string, jurisdiction: string) {
  return `/meetings/${meetingId}?jurisdiction=${encodeURIComponent(jurisdiction)}`;
}

export default async function MeetingDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ jurisdiction?: string; previewOutcome?: string }>;
}) {
  const [{ id }, query, locale, cookieStore] = await Promise.all([
    params,
    searchParams,
    getRequestLocale(),
    cookies()
  ]);
  const jurisdiction = normalizeJurisdictionSelection(
    query.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const publicJurisdiction = toPublicJurisdictionSlug(jurisdiction);
  const { meeting, cards, documents } = await getMeetingDetail(id, jurisdiction, locale);

  if (!meeting) notFound();
  const [rawVideoDocuments, { newerMeeting, olderMeeting }] = await Promise.all([
    getEmbeddableVideoDocuments(documents).length > 0
      ? Promise.resolve([])
      : getMeetingRawVideoDocuments(id, jurisdiction),
    getAdjacentMeetingsForMeeting(meeting, jurisdiction, locale)
  ]);
  const videoDocuments = rawVideoDocuments.length > 0 ? [...documents, ...rawVideoDocuments] : documents;
  const jurisdictionLabel = getJurisdictionDisplayLabel(
    meeting.jurisdiction_slug || meeting.jurisdiction_name
  );
  const meetingTitleFallback = locale === "es" ? "Reunión no indicada" : "Meeting not listed";
  const canonicalUrl = new URL(`/meetings/${encodeURIComponent(id)}`, getConfiguredAppUrl());
  canonicalUrl.searchParams.set("jurisdiction", publicJurisdiction);
  const eventJsonLd = meeting.meeting_datetime
    ? {
        "@context": "https://schema.org",
        "@type": "Event",
        name: displayMeetingTitle(meeting, meetingTitleFallback, locale),
        startDate: meeting.meeting_datetime,
        eventStatus:
          meeting.status?.toLowerCase().includes("cancel")
            ? "https://schema.org/EventCancelled"
            : "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/MixedEventAttendanceMode",
        location: meeting.location
          ? { "@type": "Place", name: meeting.location }
          : undefined,
        organizer: { "@type": "GovernmentOrganization", name: jurisdictionLabel },
        url: canonicalUrl.toString(),
        sameAs: meeting.source_url || undefined
      }
    : null;

  return (
    <div className="section-shell py-10">
      {eventJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(eventJsonLd) }}
        />
      ) : null}
      <div className="mb-8 max-w-4xl">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={meeting.status} locale={locale} />
          <span className="chip chip-selected">
            {jurisdictionLabel}
          </span>
          <span className="text-sm font-semibold text-black/70">
            {formatDisplayDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)}
          </span>
        </div>
        <h1 className="page-title mt-3">{displayMeetingTitle(meeting, meetingTitleFallback, locale)}</h1>
        <p className="page-copy mt-3 text-base">{displayMeetingType(meeting, t(locale, "meetingTypeNotListed"), locale)}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <AddToGoogleCalendarLink meeting={meeting} locale={locale} />
          <nav
            aria-label={locale === "es" ? "Navegación entre reuniones" : "Meeting navigation"}
            className="flex flex-wrap items-center gap-2"
          >
            {olderMeeting ? (
              <Link
                href={meetingHref(olderMeeting.id, publicJurisdiction)}
                aria-label={`${locale === "es" ? "Reunión anterior" : "Previous Meeting"}: ${displayMeetingTitle(olderMeeting, meetingTitleFallback, locale)}`}
                title={displayMeetingTitle(olderMeeting, meetingTitleFallback, locale)}
                className="action-secondary-sm group"
              >
                <ChevronLeft aria-hidden className="h-4 w-4 shrink-0 text-ink" />
                <span>{locale === "es" ? "Anterior" : "Previous"}</span>
              </Link>
            ) : (
              <div
                aria-disabled="true"
                className="action-disabled-sm"
              >
                <ChevronLeft aria-hidden className="h-4 w-4 shrink-0 text-black/25" />
                <span>{locale === "es" ? "Anterior" : "Previous"}</span>
              </div>
            )}

            {newerMeeting ? (
              <Link
                href={meetingHref(newerMeeting.id, publicJurisdiction)}
                aria-label={`${locale === "es" ? "Siguiente reunión" : "Next Meeting"}: ${displayMeetingTitle(newerMeeting, meetingTitleFallback, locale)}`}
                title={displayMeetingTitle(newerMeeting, meetingTitleFallback, locale)}
                className="action-secondary-sm group"
              >
                <span>{locale === "es" ? "Siguiente" : "Next"}</span>
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-ink" />
              </Link>
            ) : (
              <div
                aria-disabled="true"
                className="action-disabled-sm"
              >
                <span>{locale === "es" ? "Siguiente" : "Next"}</span>
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-black/25" />
              </div>
            )}
          </nav>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section className="space-y-4">
          <MeetingVideoEmbed documents={videoDocuments} locale={locale} />

          <div>
            <p className="label-eyebrow text-civic">{t(locale, "summaryCards")}</p>
            <h2 className="section-title mt-1">
              {locale === "es" ? "Puntos de agenda en lenguaje claro" : "Plain-English agenda items"}
            </h2>
          </div>
          {cards.length > 0 ? (
            <div className="grid gap-4">
              {cards.map((card) => {
                const previewOutcome = outcomeForLocalPreview(card, id, query.previewOutcome);
                return (
                  <SummaryCard
                    key={card.id}
                    card={card}
                    outcome={previewOutcome}
                    locale={locale}
                  />
                );
              })}
            </div>
          ) : (
            <div className="quiet-card p-8">
              <h3 className="text-xl font-bold text-ink">
                {locale === "es"
                  ? "Aún no hay tarjetas publicadas para esta reunión"
                  : "No published cards for this meeting yet"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-black/70">
                {locale === "es"
                  ? "Los administradores pueden regenerar resúmenes después de extraer el texto de la agenda."
                  : "Admins can regenerate summaries after agenda text has been extracted."}
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="quiet-card p-5 sm:p-6">
            <h2 className="text-xl font-bold text-ink">{t(locale, "officialDocuments")}</h2>
            <div className="mt-4 space-y-2">
              {documents.length > 0 ? (
                documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={getVideoLinkUrl(doc.source_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="quiet-card interactive-card flex items-start gap-3 p-4 text-sm focus-visible:focus-ring"
                  >
                    <FileText aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-civic" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{displayDocumentType(doc, locale)}</span>
                      <span className="block break-words text-black/70">
                        {displayDocumentLabel(doc, locale, t(locale, "officialSource"))}
                      </span>
                    </span>
                    <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-black/40" />
                  </a>
                ))
              ) : (
                <p className="text-sm leading-6 text-black/70">{t(locale, "noSourceDocuments")}</p>
              )}
            </div>
          </section>

          <section className="quiet-card p-5 sm:p-6">
            <h2 className="text-xl font-bold text-ink">{t(locale, "publicCommentInformation")}</h2>
            <p className="mt-2 text-sm leading-6 text-black/75">
              {meeting.public_comments_input_text || t(locale, "notListedInSource")}
            </p>
          </section>

          <section className="quiet-card p-5 sm:p-6">
            <h2 className="text-xl font-bold text-ink">{t(locale, "sourceNote")}</h2>
            <p className="mt-2 text-sm leading-6 text-black/75">
              {locale === "es"
                ? "SimpleCity resume documentos oficiales de reuniones públicas. Siempre revisa la fuente original antes de tomar decisiones formales."
                : "SimpleCity summarizes official public meeting documents. Always check the original source before making formal decisions."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
