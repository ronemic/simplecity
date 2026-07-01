import { ExternalLink } from "lucide-react";
import type { DocumentRow } from "@/lib/types";
import { type Locale } from "@/lib/i18n";
import { getEmbeddableVideoDocuments } from "@/lib/utils/videoEmbed";

function videoLabel(document: DocumentRow, locale: Locale) {
  return document.label || document.type || (locale === "es" ? "Grabación de la reunión" : "Meeting recording");
}

export function MeetingVideoEmbed({
  documents,
  locale = "en"
}: {
  documents: DocumentRow[];
  locale?: Locale;
}) {
  const videoDocuments = getEmbeddableVideoDocuments(documents);
  const primaryVideo = videoDocuments[0];
  if (!primaryVideo) return null;

  const additionalVideos = videoDocuments.slice(1);

  return (
    <section className="quiet-card overflow-hidden">
      <div className="border-b border-black/10 px-5 py-4 sm:px-6">
        <p className="label-eyebrow text-civic">
          {locale === "es" ? "Video de la reunión" : "Meeting video"}
        </p>
        <h2 className="mt-1 text-xl font-bold text-ink">
          {locale === "es" ? "Ver la grabación oficial" : "Watch the official recording"}
        </h2>
      </div>

      <div className="aspect-video bg-[#0c1726]">
        <iframe
          src={primaryVideo.embedUrl}
          title={videoLabel(primaryVideo.document, locale)}
          className="h-full w-full"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm font-semibold sm:px-6">
        <a
          href={primaryVideo.document.source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center gap-2 rounded-md text-civic underline-offset-4 hover:underline focus-visible:focus-ring"
        >
          {locale === "es" ? "Abrir grabación oficial" : "Open official recording"}
          <ExternalLink aria-hidden className="h-4 w-4" />
        </a>
        {additionalVideos.map(({ document }) => (
          <a
            key={document.id}
            href={document.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-md text-black/65 underline-offset-4 hover:text-civic hover:underline focus-visible:focus-ring"
          >
            {videoLabel(document, locale)}
            <ExternalLink aria-hidden className="h-4 w-4" />
          </a>
        ))}
      </div>
    </section>
  );
}
