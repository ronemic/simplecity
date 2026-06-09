import Link from "next/link";
import { ClipboardList, FilePenLine, Gauge, Megaphone, ScrollText } from "lucide-react";

const items = [
  { href: "/admin", label: "Dashboard", icon: Gauge },
  { href: "/admin/meetings", label: "Meetings", icon: ClipboardList },
  { href: "/admin/cards", label: "Cards", icon: FilePenLine },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/scraper-runs", label: "Scraper runs", icon: ScrollText }
];

export function AdminNav() {
  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 transition hover:bg-black/5 hover:text-ink focus-visible:focus-ring"
        >
          <item.icon aria-hidden className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
