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
    <aside className="rounded-lg border border-civic/25 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-civic/10 text-civic">
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold text-ink">{announcement.title}</h2>
          <p className="mt-1 text-sm leading-6 text-black/65">{announcement.body}</p>
        </div>
      </div>
    </aside>
  );
}
