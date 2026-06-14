import {
  FileSearch,
  Link as LinkIcon,
  MessageSquareText,
  ShieldCheck
} from "lucide-react";

const principles = [
  {
    icon: FileSearch,
    title: "Official documents first",
    body: "SimpleCity starts from public agenda materials and keeps the original source close by."
  },
  {
    icon: MessageSquareText,
    title: "Plain-language summaries",
    body: "We turn formal agenda language into short explanations of what is happening and why it matters."
  },
  {
    icon: LinkIcon,
    title: "Sources stay visible",
    body: "Every public card and meeting page points back to the agenda, packet, notice, or related record."
  }
];

export default function AboutPage() {
  return (
    <div className="section-shell py-8 sm:py-10">
      <section className="max-w-3xl border-b border-black/10 pb-8">
        <p className="label-eyebrow text-civic">About SimpleCity</p>
        <h1 className="page-title mt-2">Local decisions should be easier to follow.</h1>
        <p className="mt-4 text-lg leading-8 text-black/80">
          SimpleCity helps residents understand city meeting agendas without decoding government
          language or digging through long packet PDFs.
        </p>
      </section>

      <section className="grid gap-5 border-b border-black/10 py-8 lg:grid-cols-[0.72fr_1fr]">
        <div>
          <p className="label-eyebrow text-civic">Why we built SimpleCity</p>
          <h2 className="mt-2 text-3xl font-black text-ink">Because local decisions are close to home.</h2>
        </div>

        <p className="text-lg leading-8 text-black/80">
          We are Ruiwen, Patrick, and Samuel, a team of three local Bay Area high school students who
          wanted to understand what our local governments were discussing, but found meeting agendas
          difficult to read and often buried in long PDF packets. We built SimpleCity to make local
          decisions easier to understand while keeping official records accessible for transparency,
          because those decisions can shape everyday things like streets, housing, budgets, parks, safety,
          public services, and fees. Our goal is not to replace city records, but to help residents
          discover and understand them so they can stay informed about their community and take action
          when needed.
        </p>
      </section>

      <section className="py-8">
        <div className="mb-5 max-w-2xl">
          <p className="label-eyebrow text-civic">How we approach it</p>
          <h2 className="mt-2 text-3xl font-black text-ink">Summaries should point back to the source.</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {principles.map((item) => (
            <section key={item.title} className="quiet-card p-5">
              <item.icon aria-hidden className="h-7 w-7 text-civic" />
              <h3 className="mt-4 text-lg font-bold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-black/75">{item.body}</p>
            </section>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-black/10 bg-white p-6">
        <div className="flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-start">
          <ShieldCheck aria-hidden className="h-7 w-7 shrink-0 text-civic" />
          <div>
            <h2 className="text-2xl font-black text-ink">What SimpleCity does not do</h2>
            <p className="mt-3 text-base leading-7 text-black/75">
              SimpleCity does not replace official city records, legal notices, staff reports, or formal
              instructions from the city. It is a reading layer that helps people understand what is
              happening and where to verify it.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
