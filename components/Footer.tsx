import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-10 border-t border-black/10 bg-[#eef3f6]">
      <div className="section-shell grid gap-6 py-9 text-sm text-black/70 md:grid-cols-[1fr_auto] md:items-start">
        <div className="max-w-2xl space-y-3">
          <p className="font-semibold text-ink">SimpleCity</p>
          <p className="leading-6">
            SimpleCity is an independent site compiled by private citizens, not an official City
            website. It summarizes public meeting documents to make them easier to understand.
            Always review the original source before making formal decisions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 font-bold">
          <Link className="action-ghost" href="/about">
            About
          </Link>
          <Link className="action-ghost" href="/about">
            Source transparency
          </Link>
          <a className="action-ghost" href="mailto:simplecityadmin@gmail.com">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
