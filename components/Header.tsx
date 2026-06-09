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
    <header className="border-b border-black/10 bg-newsprint/90 backdrop-blur">
      <div className="section-shell flex min-h-16 items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-ink focus-visible:focus-ring">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-civic text-white">
            <Landmark aria-hidden className="h-5 w-5" />
          </span>
          <span className="text-lg">SimpleCity</span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1 text-sm font-semibold text-black/65">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 transition hover:bg-black/5 hover:text-ink focus-visible:focus-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
