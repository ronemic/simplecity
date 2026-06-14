import { FileSearch, Link as LinkIcon, ShieldCheck } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="section-shell py-10">
      <div className="max-w-3xl">
        <p className="text-sm font-bold uppercase text-civic">About SimpleCity</p>
        <h1 className="mt-2 text-4xl font-black text-ink">Plain-English access to local decisions</h1>
        <p className="mt-4 text-lg leading-8 text-black/80">
          SimpleCity helps residents understand city meeting agendas without needing to decode
          government language or dig through packet PDFs.
        </p>
        <br></br>
        <p className="text-sm font-bold uppercase text-civic">Why we built SimpleCity</p>
         <p className="mt-4 text-lg leading-8 text-black/80">
          We are Ruiwen, Patrick, and Samuel, a team of three local Bay Area high school students who wanted to understand what our local governments were discussing, but found meeting agendas difficult to read and often buried in long PDF packets.
        </p>
<p className="mt-4 text-lg leading-8 text-black/80">
We built SimpleCity to make local decisions easier to understand while ensuring that official records remain easily accessible for transparency. 
</p>
<p className="mt-4 text-lg leading-8 text-black/80">
Our goal is not to replace city records, but rather to help residents discover and understand them, helping them stay informed about their community and take action when needed.
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
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
          <section key={item.title} className="quiet-card p-5">
            <item.icon aria-hidden className="h-7 w-7 text-civic" />
            <h2 className="mt-4 text-lg font-bold text-ink">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-black/75">{item.body}</p>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-lg border border-black/10 bg-white p-6">
        <h2 className="text-2xl font-bold text-ink">What SimpleCity does not do</h2>
        <p className="mt-3 text-base leading-7 text-black/75">
          SimpleCity does not replace official city records, legal notices, staff reports, or formal
          instructions from the city. It is a reading layer that helps people understand what is happening
          and where to verify it.
        </p>
      </section>
    </div>
  );
}
