import type { DocumentRow } from "@/lib/types";

const VIDEO_DOCUMENT_TYPES = new Set(["media", "video", "spanish video"]);

function asUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function youtubeEmbedUrl(url: URL) {
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
  }

  if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return null;

  const videoId =
    url.pathname.startsWith("/embed/")
      ? url.pathname.split("/").filter(Boolean)[1]
      : url.searchParams.get("v");

  return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
}

export function getVideoLinkUrl(sourceUrl: string) {
  const url = asUrl(sourceUrl);
  if (!url) return sourceUrl;

  const host = url.hostname.replace(/^www\./, "");
  const isYouTubeEmbedHost = [
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com"
  ].includes(host);
  if (!isYouTubeEmbedHost || !url.pathname.startsWith("/embed/")) return sourceUrl;

  const videoId = url.pathname.split("/").filter(Boolean)[1];
  if (!videoId) return sourceUrl;

  const watchUrl = new URL("https://www.youtube.com/watch");
  watchUrl.searchParams.set("v", videoId);

  const timestamp = url.searchParams.get("t");
  const startSeconds = url.searchParams.get("start");
  if (timestamp) {
    watchUrl.searchParams.set("t", timestamp);
  } else if (startSeconds) {
    watchUrl.searchParams.set("t", /^\d+$/.test(startSeconds) ? `${startSeconds}s` : startSeconds);
  }

  for (const parameter of ["list", "index"]) {
    const value = url.searchParams.get(parameter);
    if (value) watchUrl.searchParams.set(parameter, value);
  }

  return watchUrl.toString();
}

function vimeoEmbedUrl(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  const videoId = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
  return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
}

function swagitEmbedUrl(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  if (!host.endsWith("swagit.com")) return null;

  const pathParts = url.pathname.split("/").filter(Boolean);
  const videoIndex = pathParts.findIndex((part) => part.toLowerCase() === "videos");
  const videoId = videoIndex >= 0 ? pathParts[videoIndex + 1] : null;
  if (!videoId) return null;
  if (pathParts[videoIndex + 2]?.toLowerCase() === "embed") return url.toString();

  const embedUrl = new URL(url.toString());
  embedUrl.pathname = `/${pathParts.slice(0, videoIndex + 2).join("/")}/embed`;
  return embedUrl.toString();
}

function granicusEmbedUrl(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  const lowerPath = url.pathname.toLowerCase();
  if (!host.endsWith("granicus.com")) return null;

  if (lowerPath.includes("/player/clip/")) {
    return url.toString();
  }

  if (!lowerPath.includes("mediaplayer")) return null;

  const embedUrl = new URL(url.toString());
  if (!embedUrl.searchParams.has("embed")) {
    embedUrl.searchParams.set("embed", "1");
  }
  return embedUrl.toString();
}

function legistarEmbedUrl(url: URL) {
  const lowerUrl = url.toString().toLowerCase();
  const lowerPath = url.pathname.toLowerCase();

  if (
    lowerPath.includes("/video.aspx") ||
    lowerUrl.includes("mode=video") ||
    lowerUrl.includes("mode=granicus")
  ) {
    return url.toString();
  }

  return null;
}

function iqm2EmbedUrl(url: URL) {
  const lowerUrl = url.toString().toLowerCase();
  const lowerPath = url.pathname.toLowerCase();

  if (
    url.hostname.toLowerCase().includes("iqm2.com") &&
    lowerPath.includes("/citizens/splitview.aspx") &&
    lowerUrl.includes("mode=video")
  ) {
    return url.toString();
  }

  return null;
}

export function getVideoEmbedUrl(sourceUrl: string | null | undefined) {
  const url = asUrl(sourceUrl);
  if (!url) return null;

  return youtubeEmbedUrl(url) ||
    vimeoEmbedUrl(url) ||
    swagitEmbedUrl(url) ||
    granicusEmbedUrl(url) ||
    legistarEmbedUrl(url) ||
    iqm2EmbedUrl(url);
}

function urlsFromText(value: string | null | undefined) {
  const matches = value?.match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  return matches.map((match) => match.replace(/[.,;:]+$/, ""));
}

function hasVideoUrlInText(value: string) {
  return (
    value.includes("granicus.com/player/clip") ||
    value.includes("granicus.com/mediaplayer") ||
    value.includes("swagit.com/videos") ||
    value.includes("youtube.com/watch") ||
    value.includes("youtu.be/")
  );
}

function isIgnorableVideoSourceUrl(value: string | null | undefined) {
  const sourceUrl = String(value || "").trim().toLowerCase();
  if (!sourceUrl) return false;
  if (sourceUrl.startsWith("javascript:")) return true;

  const url = asUrl(value);
  if (!url) return false;

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase().replace(/\/+$/, "");
  return host.includes("iqm2.com") && path.endsWith("/citizens/media.aspx") && !url.search;
}

function videoUrlCandidates(document: Pick<DocumentRow, "source_url" | "extracted_text">) {
  return [document.source_url, ...urlsFromText(document.extracted_text)].filter(
    (url): url is string => Boolean(url)
  );
}

export function isVideoDocument(
  document: Pick<DocumentRow, "type" | "label" | "source_url" | "extracted_text">
) {
  const type = String(document.type || "").trim().toLowerCase();
  const label = String(document.label || "").trim().toLowerCase();
  const sourceUrl = String(document.source_url || "").trim().toLowerCase();
  const extractedText = String(document.extracted_text || "").trim().toLowerCase();
  const extractedTextHasVideoUrl = hasVideoUrlInText(extractedText);

  if (isIgnorableVideoSourceUrl(document.source_url) && !extractedTextHasVideoUrl) {
    return false;
  }

  return (
    VIDEO_DOCUMENT_TYPES.has(type) ||
    label.includes("video") ||
    label.includes("vídeo") ||
    label.includes("media") ||
    sourceUrl.includes("youtube.com") ||
    sourceUrl.includes("youtu.be") ||
    sourceUrl.includes("swagit.com") ||
    sourceUrl.includes("granicus.com") ||
    sourceUrl.includes("video") ||
    sourceUrl.includes("mediaplayer") ||
    sourceUrl.includes("mode=video") ||
    sourceUrl.includes("mode=granicus") ||
    extractedTextHasVideoUrl
  );
}

function rawDocumentRows(raw: unknown) {
  const rawMeeting = raw && typeof raw === "object" ? raw as { documents?: unknown } : null;
  const documents = Array.isArray(rawMeeting?.documents) ? rawMeeting.documents : [];

  return documents.flatMap((document, index): DocumentRow[] => {
    if (!document || typeof document !== "object") return [];
    const rawDocument = document as {
      type?: unknown;
      label?: unknown;
      url?: unknown;
      source_url?: unknown;
    };
    const sourceUrl =
      typeof rawDocument.url === "string"
        ? rawDocument.url
        : typeof rawDocument.source_url === "string"
          ? rawDocument.source_url
          : "";

    if (!sourceUrl) return [];

    return [{
      id: `raw-video-${index}`,
      meeting_id: null,
      jurisdiction_name: null,
      jurisdiction_slug: null,
      platform: null,
      type: typeof rawDocument.type === "string" ? rawDocument.type : null,
      label: typeof rawDocument.label === "string" ? rawDocument.label : null,
      source_url: sourceUrl,
      local_path: null,
      storage_path: null,
      bytes: null,
      download_error: null,
      extracted_text: null,
      extraction_character_count: null,
      is_scanned: null,
      created_at: null
    }];
  });
}

export function getMeetingVideoDocuments(documents: DocumentRow[], rawMeeting?: unknown) {
  const seen = new Set<string>();

  return [...documents, ...rawDocumentRows(rawMeeting)].filter((document) => {
    if (!isVideoDocument(document)) return false;
    const key = document.source_url.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getEmbeddableVideoDocuments(documents: DocumentRow[], rawMeeting?: unknown) {
  return getMeetingVideoDocuments(documents, rawMeeting).flatMap((document) => {
    const embedUrl = videoUrlCandidates(document)
      .map((url) => getVideoEmbedUrl(url))
      .find((url): url is string => Boolean(url));

    return embedUrl ? [{ document, embedUrl }] : [];
  });
}
