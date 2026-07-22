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
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import {
  MEETING_VIEW_PREFERENCE_COOKIE,
  normalizeMeetingView
} from "@/lib/config/meetingView";

export const revalidate = 300;

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    month?: string;
    date?: string;
    view?: string;
    jurisdiction?: string;
  }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const jurisdiction = params.jurisdiction
    ? normalizeJurisdictionSelection(params.jurisdiction)
    : ALL_JURISDICTIONS_SLUG;
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const label = jurisdiction === ALL_JURISDICTIONS_SLUG ? "Local government" : jurisdictionLabel;
  const title = `${label} public meetings | SimpleCity`;
  const description = `Browse ${label.toLowerCase()} public meetings, dates, agendas, official documents, and decision briefings.`;
  const canonicalUrl = new URL("/meetings", getConfiguredAppUrl());
  if (params.jurisdiction) {
    canonicalUrl.searchParams.set("jurisdiction", toPublicJurisdictionSlug(jurisdiction));
  }
  const isFiltered = Boolean(params.q || params.month || params.date || params.view);

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl.toString() },
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: { title, description, type: "website", url: canonicalUrl.toString(), siteName: "SimpleCity" },
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
    jurisdiction?: string;
  }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const cookieStore = await cookies();
  const jurisdiction = normalizeJurisdictionSelection(
    params.jurisdiction || cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const jurisdictionLabel = getJurisdictionLabel(jurisdiction);
  const search = params.q || "";
  const view = normalizeMeetingView(
    params.view || cookieStore.get(MEETING_VIEW_PREFERENCE_COOKIE)?.value
  );
  const meetings = await getMeetings({ jurisdiction, locale });

  return (
    <div className="section-shell py-10">
      <div className="mb-6 max-w-3xl">
        <p className="label-eyebrow text-civic">{t(locale, "meetings")}</p>
        <h1 className="page-title mt-2">
          {meetingsTitle(locale, jurisdiction, jurisdictionLabel)}
        </h1>
        <p className="page-copy mt-3 text-base">
          {t(locale, "meetingsDescription")}
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
