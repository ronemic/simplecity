import { AlertCircle, CalendarClock, Info } from "lucide-react";
import type { AnnouncementRow } from "@/lib/types";

const icons = {
  info: Info,
  alert: AlertCircle,
  event: CalendarClock
};

function jurisdictionLabel(slug?: string | null) {
  if (!slug) return "All";
  if (slug === "san-mateo-city") return "San Mateo";
  if (slug === "santa-clara-county") return "Santa Clara County";
  return "Foster City";
}

export function AnnouncementBanner({ announcements }: { announcements?: AnnouncementRow[] | null }) {
  if (!announcements || announcements.length === 0) return null;

  return (
    <div className="grid gap-3">
      {announcements.map((announcement) => {
        const Icon = icons[(announcement.type || "info") as keyof typeof icons] || Info;

        return (
          <aside
            key={announcement.id}
            className="overflow-hidden rounded-[10px] border border-black/10 bg-white shadow-[0_1px_2px_rgba(23,23,23,0.04)]"
          >
            <div className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#eef3f6] text-[#12365f]">
                <Icon aria-hidden className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="label-eyebrow text-black/[0.65]">
                  Admin announcement · {jurisdictionLabel(announcement.jurisdiction_slug)}
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
