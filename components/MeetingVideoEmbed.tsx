import { ChevronDown, ExternalLink } from "lucide-react";
import type { DocumentRow } from "@/lib/types";
import { type Locale } from "@/lib/i18n";
import { getEmbeddableVideoDocuments } from "@/lib/utils/videoEmbed";

function videoLabel(document: DocumentRow, locale: Locale) {
  return document.label || document.type || (locale === "es" ? "Grabación de la reunión" : "Meeting recording");
}

function parseTimestampValue(value: string | null | undefined) {
  if (!value) return null;

  const normalized = decodeURIComponent(value).trim().toLowerCase();
  const colonParts = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (colonParts) {
    const [, hoursOrMinutes, minutesOrSeconds, secondsText] = colonParts;
    return secondsText
      ? Number(hoursOrMinutes) * 3600 + Number(minutesOrSeconds) * 60 + Number(secondsText)
      : Number(hoursOrMinutes) * 60 + Number(minutesOrSeconds);
  }

  const unitParts = normalized.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (unitParts && (unitParts[1] || unitParts[2] || unitParts[3])) {
    return Number(unitParts[1] || 0) * 3600 + Number(unitParts[2] || 0) * 60 + Number(unitParts[3] || 0);
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function timestampSecondsFromUrl(sourceUrl: string | null | undefined) {
  if (!sourceUrl) return null;

  try {
    const url = new URL(sourceUrl);
    const timestampParams = new Set([
      "start",
      "starttime",
      "start_time",
      "t",
      "time",
      "timestamp",
      "position",
      "mediaposition",
      "media_position"
    ]);

    for (const [key, value] of url.searchParams.entries()) {
      if (!timestampParams.has(key.toLowerCase())) continue;
      const seconds = parseTimestampValue(value);
      if (seconds !== null) return seconds;
    }

    const hash = url.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    for (const [key, value] of hashParams.entries()) {
      if (!timestampParams.has(key.toLowerCase())) continue;
      const seconds = parseTimestampValue(value);
      if (seconds !== null) return seconds;
    }
  } catch {
    return null;
  }

  return null;
}

function formatTimestamp(seconds: number) {
  const roundedSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;

  if (hours > 0) {
    return [
      String(hours),
      String(minutes).padStart(2, "0"),
      String(remainingSeconds).padStart(2, "0")
    ].join(":");
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function mediaMode(document: DocumentRow) {
  try {
    const url = new URL(document.source_url);
    return url.searchParams.get("Mode2")?.toLowerCase() || "";
  } catch {
    return "";
  }
}

function isAudioRecordingLink(document: DocumentRow) {
  const mode = mediaMode(document);
  return mode.includes("audio") || String(document.label || "").toLowerCase().includes("audio");
}

function clipLinkLabel(document: DocumentRow, index: number, locale: Locale) {
  const timestamp = timestampSecondsFromUrl(document.source_url);
  if (timestamp !== null && timestamp > 0) {
    return locale === "es"
      ? `Clip ${index + 1} · ${formatTimestamp(timestamp)}`
      : `Clip ${index + 1} · ${formatTimestamp(timestamp)}`;
  }

  return locale === "es" ? `Clip de agenda ${index + 1}` : `Agenda clip ${index + 1}`;
}

function audioLinkLabel(document: DocumentRow, index: number, locale: Locale) {
  const mode = mediaMode(document);
  if (mode.includes("audiodownload")) {
    return locale === "es" ? "Descargar audio" : "Audio download";
  }

  return locale === "es" ? `Pista de audio ${index + 1}` : `Audio track ${index + 1}`;
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
  const additionalVideoLinks = additionalVideos.map(({ document }) => document);
  const agendaClipLinks = additionalVideoLinks.filter((document) => !isAudioRecordingLink(document));
  const audioLinks = additionalVideoLinks.filter(isAudioRecordingLink);

  return (
    <section className="quiet-card overflow-hidden">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition hover:bg-[#f7fbff] focus-visible:focus-ring sm:px-6 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="label-eyebrow block text-civic">
              {locale === "es" ? "Video de la reunión" : "Meeting video"}
            </span>
            <span className="mt-1 block text-xl font-bold text-ink">
              {locale === "es" ? "Ver la grabación oficial" : "Watch the official recording"}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 py-1 text-sm font-bold text-black/65">
            <span className="group-open:hidden">{locale === "es" ? "Mostrar video" : "Show video"}</span>
            <span className="hidden group-open:inline">{locale === "es" ? "Ocultar video" : "Hide video"}</span>
            <ChevronDown aria-hidden className="h-4 w-4 transition group-open:rotate-180" />
          </span>
        </summary>

        <div className="aspect-video border-t border-black/10 bg-[#0c1726]">
          <iframe
            src={primaryVideo.embedUrl}
            title={videoLabel(primaryVideo.document, locale)}
            className="h-full w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <div className="border-t border-black/10 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-[0.08em] text-black/45">
              {locale === "es" ? "Enlaces de grabación" : "Recording links"}
            </span>
            <a
              href={primaryVideo.document.source_url}
              target="_blank"
              rel="noreferrer"
              className="action-civic-xs"
            >
              {locale === "es" ? "Grabación completa" : "Full recording"}
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          </div>

          {additionalVideoLinks.length > 0 ? (
            <details className="group/links mt-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-bold text-black/70 transition hover:border-civic/25 hover:bg-[#f7fbff] hover:text-civic focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
                <span>
                  {locale === "es"
                    ? `${additionalVideoLinks.length} enlaces adicionales`
                    : `${additionalVideoLinks.length} additional links`}
                </span>
                <ChevronDown aria-hidden className="h-4 w-4 shrink-0 transition group-open/links:rotate-180" />
              </summary>
              <div className="mt-3 grid gap-3">
                {agendaClipLinks.length > 0 ? (
                  <div>
                    <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-black/45">
                      {locale === "es" ? "Clips de agenda" : "Agenda clips"}
                    </p>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                      {agendaClipLinks.map((document, index) => (
                        <a
                          key={document.id}
                          href={document.source_url}
                          target="_blank"
                          rel="noreferrer"
                          title={videoLabel(document, locale)}
                          className="action-row-sm"
                        >
                          <span className="truncate">{clipLinkLabel(document, index, locale)}</span>
                          <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {audioLinks.length > 0 ? (
                  <div>
                    <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-black/45">
                      {locale === "es" ? "Audio" : "Audio"}
                    </p>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                      {audioLinks.map((document, index) => (
                        <a
                          key={document.id}
                          href={document.source_url}
                          target="_blank"
                          rel="noreferrer"
                          title={videoLabel(document, locale)}
                          className="action-row-sm"
                        >
                          <span className="truncate">{audioLinkLabel(document, index, locale)}</span>
                          <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </details>
    </section>
  );
}
