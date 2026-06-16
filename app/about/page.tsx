import {
  FileSearch,
  Landmark,
  Layers3,
  Link as LinkIcon,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { getPublicStats } from "@/lib/db/queries";

export const revalidate = 300;

const numberFormatter = new Intl.NumberFormat("en-US");

function formatStat(value: number) {
  return numberFormatter.format(value);
}

export default async function AboutPage() {
  const stats = await getPublicStats();

  const statItems = [
    {
      icon: WalletCards,
      label: "Agenda items",
      value: stats.agendaItemsAnalyzed,
      detail: "Agenda items analyzed"
    },
    {
      icon: Layers3,
      label: "Meetings analyzed",
      value: stats.meetingsAnalyzed,
      detail: "Official meetings analyzed"
    },
    {
      icon: Landmark,
      label: "Jurisdictions",
      value: stats.jurisdictionsSupported,
      detail: "Local jurisdictions supported"
    },
    {
      icon: LinkIcon,
      label: "Transparency",
      valueText: "100%",
      detail: "Source-linked"
    }
  ];

  return (
    <div className="section-shell py-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="max-w-3xl">
          <p className="label-eyebrow !text-civic">About SimpleCity</p>
          <h1 className="page-title mt-2">Plain-English access to local decisions</h1>
          <p className="page-copy mt-4">
            SimpleCity helps residents understand city meeting agendas without needing to decode
            government language or dig through packet PDFs.
          </p>

          <section className="mt-10">
            <p className="label-eyebrow !text-civic">Why we built SimpleCity</p>
            <div className="mt-4 space-y-4">
              <p className="page-copy">
                We are Ruiwen, Patrick, and Samuel, a team of three local Bay Area high school
                students who wanted to understand what our local governments were discussing, but
                found meeting agendas difficult to read and often buried in long PDF packets.
              </p>
              <p className="page-copy">
                We built SimpleCity to make local decisions easier to understand while ensuring that
                official records remain easily accessible for transparency.
              </p>
              <p className="page-copy">
                Our goal is not to replace city records, but rather to help residents discover and
                understand them, helping them stay informed about their community and take action
                when needed.
              </p>
            </div>
          </section>
        </div>

        <section className="lg:pt-6">
          <p className="label-eyebrow !text-civic">SimpleCity by the numbers</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {statItems.map((item) => (
              <div key={item.label} className="quiet-card p-3 sm:p-4">
                <div className="flex items-center justify-between gap-4">
                  <item.icon aria-hidden className="h-5 w-5 text-civic" />
                  <p className="label-eyebrow text-black/50">{item.label}</p>
                </div>
                <p className="mt-3 text-2xl font-black leading-none text-ink">
                  {"valueText" in item ? item.valueText : formatStat(item.value)}
                </p>
                <p className="mt-1.5 text-sm font-semibold leading-5 text-black/65">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-10">
        <p className="label-eyebrow !text-civic">How SimpleCity works</p>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: FileSearch,
              title: "Official documents first",
              body: "The scraper reads PrimeGov agenda tables and preserves each official source URL."
            },
            {
              icon: ShieldCheck,
              title: "Careful summaries",
              body: "Cards are generated from extracted agenda text and validated before they appear in the app."
            },
            {
              icon: LinkIcon,
              title: "Sources stay visible",
              body: "Every public card and meeting page links back to the original agenda, packet, or notice."
            }
          ].map((item) => (
            <section key={item.title} className="quiet-card p-6">
              <item.icon aria-hidden className="h-7 w-7 text-civic" />
              <h2 className="mt-4 text-lg font-bold text-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-black/75">{item.body}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="quiet-card mt-10 p-6">
        <h2 className="section-title">What SimpleCity does not do</h2>
        <p className="mt-3 text-base leading-7 text-black/75">
          SimpleCity does not replace official city records, legal notices, staff reports, or formal
          instructions from the city. It is a reading layer that helps people understand what is
          happening and where to verify it.
        </p>
      </section>
    </div>
  );
}
