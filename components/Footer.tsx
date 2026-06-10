import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-black/10 bg-transparent">
      <div className="section-shell grid gap-6 py-10 text-sm text-black/70 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <p>
            SimpleCity summarizes official public meeting documents. Always check the original source before
            making formal decisions.
          </p>
          <p>
            Contact us at{" "}
            <a className="font-semibold text-ink underline" href="mailto:simplecityadmin@gmail.com">
              simplecityadmin@gmail.com
            </a>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2 font-semibold">
          <Link className="action-ghost px-3 py-2" href="/about">
            Source transparency
          </Link>
        </div>
      </div>
    </footer>
  );
}
