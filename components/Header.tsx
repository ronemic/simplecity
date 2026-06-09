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
      <div className="section-shell flex min-h-16 flex-col items-start justify-between gap-3 py-3 sm:flex-row sm:items-center sm:gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-ink focus-visible:focus-ring">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-civic text-white shadow-sm">
            <Landmark aria-hidden className="h-5 w-5" />
          </span>
          <span className="text-lg">SimpleCity</span>
        </Link>
        <nav className="grid w-full grid-cols-4 gap-1 text-sm font-semibold text-black/75 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-2 py-2 text-center transition hover:bg-black/5 hover:text-ink focus-visible:focus-ring sm:px-4"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
