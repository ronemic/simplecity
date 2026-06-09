import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-black/10 bg-newsprint">
      <div className="section-shell grid gap-6 py-8 text-sm text-black/60 md:grid-cols-[1fr_auto]">
        <p>
          SimpleCity summarizes official public meeting documents. Always check the original source before
          making formal decisions.
        </p>
        <div className="flex gap-4 font-semibold">
          <Link className="hover:text-ink focus-visible:focus-ring" href="/about">
            Source transparency
          </Link>
          <Link className="hover:text-ink focus-visible:focus-ring" href="/admin">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
