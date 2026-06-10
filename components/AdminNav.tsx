import Link from "next/link";
import { ClipboardList, FilePenLine, Gauge, LogOut, Megaphone, ScrollText } from "lucide-react";

const items = [
  { href: "/admin", label: "Dashboard", icon: Gauge },
  { href: "/admin/meetings", label: "Meetings", icon: ClipboardList },
  { href: "/admin/cards", label: "Cards", icon: FilePenLine },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/scraper-runs", label: "Scraper runs", icon: ScrollText }
];

export function AdminNav({ jurisdiction = "san-mateo-city" }: { jurisdiction?: string }) {
  return (
    <nav className="flex flex-wrap gap-2 rounded-lg border border-black/10 bg-white p-2 shadow-sm">
      {items.map((item) => (
        <Link
          key={item.href}
          href={`${item.href}?jurisdiction=${jurisdiction}`}
          className="action-secondary px-4 py-2"
        >
          <item.icon aria-hidden className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
      <form action="/api/admin/logout" method="post" className="ml-auto">
        <button type="submit" className="action-secondary px-4 py-2">
          <LogOut aria-hidden className="h-4 w-4" />
          Log out
        </button>
      </form>
    </nav>
  );
}
