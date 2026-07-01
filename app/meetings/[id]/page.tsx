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

  return (
    <div className="section-shell py-10">
      <div className="mb-8 max-w-4xl">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={meeting.status} locale={locale} />
          <span className="rounded-full border border-civic/15 bg-[#eef5ff] px-2.5 py-1 text-xs font-bold text-[#1646b8]">
            {jurisdictionLabel}
          </span>
          <span className="text-sm font-semibold text-black/70">
            {formatDisplayDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)}
          </span>
        </div>
        <h1 className="page-title mt-3">{displayMeetingTitle(meeting)}</h1>
        <p className="page-copy mt-3 text-base">{displayMeetingType(meeting)}</p>
        <AddToGoogleCalendarLink meeting={meeting} className="mt-5" locale={locale} />
      </div>

      <nav
        aria-label={locale === "es" ? "Navegación entre reuniones" : "Meeting navigation"}
        className="mb-8 grid gap-3 sm:grid-cols-2"
      >
        {olderMeeting ? (
          <Link
            href={meetingHref(olderMeeting.id, publicJurisdiction)}
            className="quiet-card group flex min-h-24 items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-civic/25 hover:shadow-soft focus-visible:focus-ring"
          >
            <ChevronLeft aria-hidden className="h-5 w-5 shrink-0 text-civic transition group-hover:-translate-x-0.5" />
            <span className="min-w-0">
              <span className="label-eyebrow block text-black/55">
                {locale === "es" ? "Reunión anterior" : "Previous meeting"}
              </span>
              <span className="mt-1 line-clamp-2 block text-sm font-black leading-5 text-ink">
                {displayMeetingTitle(olderMeeting)}
              </span>
              <span className="mt-1 block text-xs font-semibold text-black/55">
                {formatDisplayDate(olderMeeting.date_text, olderMeeting.meeting_datetime, olderMeeting.time_text)}
              </span>
            </span>
          </Link>
        ) : (
          <div className="quiet-card flex min-h-24 items-center gap-3 p-4 opacity-55">
            <ChevronLeft aria-hidden className="h-5 w-5 shrink-0 text-black/35" />
            <span className="text-sm font-semibold text-black/55">
              {locale === "es" ? "No hay reunión anterior" : "No previous meeting"}
            </span>
          </div>
        )}

        {newerMeeting ? (
          <Link
            href={meetingHref(newerMeeting.id, publicJurisdiction)}
            className="quiet-card group flex min-h-24 items-center justify-between gap-3 p-4 text-right transition hover:-translate-y-0.5 hover:border-civic/25 hover:shadow-soft focus-visible:focus-ring"
          >
            <span className="min-w-0">
              <span className="label-eyebrow block text-black/55">
                {locale === "es" ? "Siguiente reunión" : "Next meeting"}
              </span>
              <span className="mt-1 line-clamp-2 block text-sm font-black leading-5 text-ink">
                {displayMeetingTitle(newerMeeting)}
              </span>
              <span className="mt-1 block text-xs font-semibold text-black/55">
                {formatDisplayDate(newerMeeting.date_text, newerMeeting.meeting_datetime, newerMeeting.time_text)}
              </span>
            </span>
            <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-civic transition group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <div className="quiet-card flex min-h-24 items-center justify-end gap-3 p-4 text-right opacity-55">
            <span className="text-sm font-semibold text-black/55">
              {locale === "es" ? "No hay siguiente reunión" : "No next meeting"}
            </span>
            <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-black/35" />
          </div>
        )}
      </nav>

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
                    className="flex items-start gap-3 rounded-lg border border-black/10 bg-white p-4 text-sm transition hover:-translate-y-0.5 hover:bg-black/[0.025] hover:shadow-sm focus-visible:focus-ring"
                  >
                    <FileText aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-civic" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{doc.type || "Document"}</span>
                      <span className="block break-words text-black/70">{doc.label || t(locale, "officialSource")}</span>
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
