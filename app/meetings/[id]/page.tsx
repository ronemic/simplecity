import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, FileText } from "lucide-react";
import { AddToGoogleCalendarLink } from "@/components/AddToGoogleCalendarLink";
import { MeetingVideoEmbed } from "@/components/MeetingVideoEmbed";
import { SummaryCard } from "@/components/SummaryCard";
import { StatusPill } from "@/components/StatusPill";
import { getMeetingDetail, getMeetingRawVideoDocuments, getMeetings } from "@/lib/db/queries";
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
import { getAdjacentMeetings } from "@/lib/utils/meetingNavigation";
import { getEmbeddableVideoDocuments } from "@/lib/utils/videoEmbed";
import { t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export const revalidate = 300;

function meetingHref(meetingId: string, jurisdiction: string) {
  return `/meetings/${meetingId}?jurisdiction=${encodeURIComponent(jurisdiction)}`;
}

export default async function MeetingDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ jurisdiction?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const locale = await getRequestLocale();
  const cookieStore = await cookies();
  const jurisdiction = normalizeJurisdictionSelection(
    query.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const publicJurisdiction = toPublicJurisdictionSlug(jurisdiction);
  const [{ meeting, cards, documents }, meetings] = await Promise.all([
    getMeetingDetail(id, jurisdiction, locale),
    getMeetings({ jurisdiction, locale })
  ]);

  if (!meeting) notFound();
  const rawVideoDocuments =
    getEmbeddableVideoDocuments(documents).length > 0
      ? []
      : await getMeetingRawVideoDocuments(id, jurisdiction);
  const videoDocuments = rawVideoDocuments.length > 0 ? [...documents, ...rawVideoDocuments] : documents;
  const { newerMeeting, olderMeeting } = getAdjacentMeetings(meetings, meeting.id);
  const jurisdictionLabel = getJurisdictionDisplayLabel(
    meeting.jurisdiction_slug || meeting.jurisdiction_name
  );
  const meetingTitleFallback = locale === "es" ? "Reunión no indicada" : "Meeting not listed";

  return (
    <div className="section-shell py-10">
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
              {cards.map((card) => (
                <SummaryCard key={card.id} card={card} locale={locale} />
              ))}
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
                    href={doc.source_url}
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
