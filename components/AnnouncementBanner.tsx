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
    <div className="grid gap-4">
      {announcements.map((announcement) => {
        const Icon = icons[(announcement.type || "info") as keyof typeof icons] || Info;

        return (
          <aside key={announcement.id} className="quiet-card border-civic/20 p-5 sm:p-6">
            <div className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-civic/10 text-civic">
                <Icon aria-hidden className="h-5 w-5" />
              </span>
              <div>
                <p className="label-eyebrow">
                  Announcement · {jurisdictionLabel(announcement.jurisdiction_slug)}
                </p>
                <h2 className="mt-1 text-xl font-bold text-ink">{announcement.title}</h2>
                <p className="mt-2 text-sm leading-6 text-black/75">{announcement.body}</p>
              </div>
            </div>
          </aside>
        );
      })}
    </div>
  );
}
