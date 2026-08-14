import { AlertCircle, CalendarClock, Info } from "lucide-react";
import { getJurisdictionDisplayLabel } from "@/lib/config/jurisdictions";
import type { AnnouncementRow } from "@/lib/types";
import { type Locale, t } from "@/lib/i18n";

const icons = {
  info: Info,
  alert: AlertCircle,
  event: CalendarClock
};

function jurisdictionLabel(slug?: string | null) {
  if (!slug) return "All";
  return getJurisdictionDisplayLabel(slug);
}

export function AnnouncementBanner({
  announcements,
  locale = "en"
}: {
  announcements?: AnnouncementRow[] | null;
  locale?: Locale;
}) {
  if (!announcements || announcements.length === 0) return null;

  return (
    <div className="grid gap-3">
      {announcements.map((announcement) => {
        const Icon = icons[(announcement.type || "info") as keyof typeof icons] || Info;

        return (
          <aside
            key={announcement.id}
            className="quiet-card overflow-hidden"
          >
            <div className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:p-5">
              <span className="icon-tile-sm">
                <Icon aria-hidden className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="label-eyebrow text-black/[0.65]">
                  {t(locale, "adminAnnouncement")} · {jurisdictionLabel(announcement.jurisdiction_slug)}
                </p>
                <h2 className="mt-1 text-xl font-black leading-snug text-ink">{announcement.title}</h2>
                <p className="mt-2 text-sm leading-6 text-black/75">{announcement.body}</p>
              </div>
            </div>
          </aside>
        );
      })}
    </div>
  );
}
