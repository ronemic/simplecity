import type { Metadata } from "next";
import { MeetingsBrowser } from "@/components/MeetingsBrowser";
import { getMeetings } from "@/lib/db/queries";
import { cookies } from "next/headers";
import {
  ALL_JURISDICTIONS_SLUG,
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionLabel,
  normalizeJurisdictionSelection,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";
import {
  MEETING_VIEW_PREFERENCE_COOKIE,
  normalizeMeetingView
} from "@/lib/config/meetingView";
import { SantaBarbaraBodyHeading } from "@/components/SantaBarbaraBodyHeading";
import { normalizeSantaBarbaraBodyView } from "@/lib/utils/santaBarbaraBody";

export const revalidate = 300;

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    month?: string;
    date?: string;
    view?: string;
    body?: string;
    jurisdiction?: string;
    lang?: string;
  }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const locale = seoLocale(params.lang);
  const jurisdiction = params.jurisdiction
    ? normalizeJurisdictionSelection(params.jurisdiction)
    : ALL_JURISDICTIONS_SLUG;
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const label = jurisdiction === ALL_JURISDICTIONS_SLUG ? "Local government" : jurisdictionLabel;
  const title =
    locale === "es"
      ? `${jurisdiction === ALL_JURISDICTIONS_SLUG ? "Reuniones públicas locales" : `Reuniones públicas de ${jurisdictionLabel}`} | SimpleCity`
      : `${label} public meetings | SimpleCity`;
  const description =
    locale === "es"
      ? `Consulta reuniones públicas de ${jurisdiction === ALL_JURISDICTIONS_SLUG ? "gobiernos locales" : jurisdictionLabel}, fechas, agendas, documentos oficiales y resúmenes de decisiones.`
      : `Browse ${label.toLowerCase()} public meetings, dates, agendas, official documents, and decision briefings.`;
  const canonicalUrl = new URL("/meetings", "https://simplecity.invalid");
  if (params.jurisdiction) {
    canonicalUrl.searchParams.set("jurisdiction", toPublicJurisdictionSlug(jurisdiction));
  }
  const urls = localizedSeoUrls(`${canonicalUrl.pathname}${canonicalUrl.search}`, locale);
  const isFiltered = Boolean(params.q || params.month || params.date || params.view || params.body);

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages },
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: { title, description, type: "website", url: urls.canonical, siteName: "SimpleCity" },
    twitter: { card: "summary", title, description }
  };
}

function meetingsTitle(locale: "en" | "es", jurisdiction: string, jurisdictionLabel: string) {
  if (jurisdiction === ALL_JURISDICTIONS_SLUG) {
    return locale === "es" ? "Reuniones de todas las jurisdicciones" : "All meetings";
  }

  return locale === "es" ? `Reuniones de ${jurisdictionLabel}` : `${jurisdictionLabel} meetings`;
}

export default async function MeetingsPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    month?: string;
    date?: string;
    view?: string;
    body?: string;
    jurisdiction?: string;
    lang?: string;
  }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const cookieStore = await cookies();
  const jurisdiction = normalizeJurisdictionSelection(
    params.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const isSantaBarbara = jurisdiction === "santa-barbara-county";
  const santaBarbaraBody = normalizeSantaBarbaraBodyView(params.body);
  const search = params.q || "";
  const view = normalizeMeetingView(
    params.view || cookieStore.get(MEETING_VIEW_PREFERENCE_COOKIE)?.value
  );
  const meetings = await getMeetings({
    jurisdiction,
    locale,
    body:
      isSantaBarbara && santaBarbaraBody !== "all"
        ? santaBarbaraBody
        : undefined
  });

  return (
    <div className="section-shell py-10">
      <div className="mb-6 max-w-3xl">
        <p className="label-eyebrow text-civic">{t(locale, "meetings")}</p>
        {isSantaBarbara ? (
          <SantaBarbaraBodyHeading activeBody={santaBarbaraBody} locale={locale} page="meetings" />
        ) : (
          <h1 className="page-title mt-2">
            {meetingsTitle(locale, jurisdiction, jurisdictionLabel)}
          </h1>
        )}
        <p className="page-copy mt-3 text-base">
          {isSantaBarbara && santaBarbaraBody === "planning"
            ? locale === "es"
              ? "La Comisión de Planificación es un órgano asesor; sus acciones no son decisiones finales del condado."
              : "The Planning Commission is an advisory body; its actions are not final county decisions."
            : t(locale, "meetingsDescription")}
        </p>
      </div>

      <MeetingsBrowser
        meetings={meetings}
        initialSearch={search}
        view={view}
        month={params.month}
        date={params.date}
        jurisdiction={params.jurisdiction}
        searchPlaceholder={t(locale, "searchMeetings")}
        locale={locale}
      />
    </div>
  );
}
