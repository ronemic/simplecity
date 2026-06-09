import { AlertCircle, CalendarClock, Info } from "lucide-react";
import type { AnnouncementRow } from "@/lib/types";

const icons = {
  info: Info,
  alert: AlertCircle,
  event: CalendarClock
};

export function AnnouncementBanner({ announcement }: { announcement?: AnnouncementRow | null }) {
  if (!announcement) return null;

  const Icon = icons[(announcement.type || "info") as keyof typeof icons] || Info;

  return (
    <aside className="quiet-card border-civic/20 p-5 sm:p-6">
      <div className="flex gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-civic/10 text-civic">
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        <div>
          <p className="label-eyebrow">Announcement</p>
          <h2 className="mt-1 text-xl font-bold text-ink">{announcement.title}</h2>
          <p className="mt-2 text-sm leading-6 text-black/65">{announcement.body}</p>
        </div>
      </div>
    </aside>
  );
}
