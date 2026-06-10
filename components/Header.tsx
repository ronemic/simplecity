import Link from "next/link";

const nav = [
  { href: "/", label: "Home" },
  { href: "/meetings", label: "Meetings" },
  { href: "/categories", label: "Categories" },
  { href: "/about", label: "About" }
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-newsprint/95 backdrop-blur-xl">
      <div className="section-shell flex min-h-[88px] flex-col items-stretch justify-between gap-4 py-4 sm:flex-row sm:items-center">
        <Link
          href="/"
          className="flex items-center gap-3 text-[22px] font-bold leading-none text-ink focus-visible:focus-ring"
        >
          <img src="/favicon.svg" alt="" className="h-9 w-9 shrink-0 rounded-lg shadow-sm" />
          <span>SimpleCity</span>
        </Link>
        <nav className="grid w-full grid-cols-2 gap-2 text-base font-semibold text-ink sm:flex sm:w-auto sm:items-center sm:justify-end sm:gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-black/25 bg-white px-5 py-2 text-center transition hover:border-black/40 hover:bg-black/[0.025] focus-visible:focus-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
