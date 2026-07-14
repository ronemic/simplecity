import { MeetingList } from "@/components/MeetingList";
import { MeetingsFilterForm } from "@/components/MeetingsFilterForm";
import { getMeetings } from "@/lib/db/queries";
import { cookies } from "next/headers";
import {
  ALL_JURISDICTIONS_SLUG,
  JURISDICTION_PREFERENCE_COOKIE,
  getJurisdictionLabel,
  normalizeJurisdictionSelection
} from "@/lib/config/jurisdictions";
import { statusLabel, t } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import {
  MEETING_VIEW_PREFERENCE_COOKIE,
  normalizeMeetingView
} from "@/lib/config/meetingView";

export const revalidate = 300;

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
    status?: string;
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
  const status = params.status || "";
  const view = normalizeMeetingView(
    params.view || cookieStore.get(MEETING_VIEW_PREFERENCE_COOKIE)?.value
  );
  const meetings = await getMeetings({ search, status, jurisdiction, locale });
  const meetingListKey = [
    jurisdiction,
    search,
    status,
    view,
    params.month || "",
    params.date || ""
  ].join("|");
  const statusOptions = [
    { value: "", label: t(locale, "allStatuses") },
    { value: "Upcoming", label: statusLabel(locale, "Upcoming") },
    { value: "Past", label: statusLabel(locale, "Past") },
    { value: "Cancelled", label: statusLabel(locale, "Cancelled") }
  ];

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

      <MeetingsFilterForm
        key={status}
        search={params.q || ""}
        status={status}
        view={view}
        month={params.month}
        date={params.date}
        jurisdiction={params.jurisdiction}
        searchPlaceholder={t(locale, "searchMeetings")}
        statusLabel={t(locale, "status")}
        statusOptions={statusOptions}
        filterLabel={t(locale, "filter")}
      />

      <MeetingList
        key={meetingListKey}
        meetings={meetings}
        month={params.month}
        selectedDate={params.date}
        search={search}
        view={view}
        locale={locale}
      />
    </div>
  );
}
