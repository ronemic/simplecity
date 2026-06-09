import Link from "next/link";
import { Landmark } from "lucide-react";

const nav = [
  { href: "/meetings", label: "Meetings" },
  { href: "/categories", label: "Categories" },
  { href: "/about", label: "About" },
  { href: "/admin", label: "Admin" }
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-white/90 backdrop-blur-xl">
      <div className="section-shell flex min-h-16 items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-ink focus-visible:focus-ring">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-civic text-white shadow-sm">
            <Landmark aria-hidden className="h-5 w-5" />
          </span>
          <span className="text-lg">SimpleCity</span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-2 text-sm font-semibold text-black/75">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-4 py-2 transition hover:bg-black/5 hover:text-ink focus-visible:focus-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
