import assert from "node:assert/strict";
import test from "node:test";
import {
  getEmbeddableVideoDocuments,
  getMeetingVideoDocuments,
  getVideoEmbedUrl
} from "@/lib/utils/videoEmbed";
import type { DocumentRow } from "@/lib/types";

function document(overrides: Partial<DocumentRow>): DocumentRow {
  return {
    id: overrides.id || "doc-1",
    meeting_id: null,
    jurisdiction_name: null,
    jurisdiction_slug: null,
    platform: null,
    type: overrides.type || "Document",
    label: overrides.label || null,
    source_url: overrides.source_url || "https://example.com/document.pdf",
    local_path: null,
    storage_path: null,
    bytes: null,
    download_error: null,
    extracted_text: overrides.extracted_text || null,
    extraction_character_count: null,
    is_scanned: null,
    created_at: null
  };
}

test("converts YouTube and Vimeo links to embeddable URLs", () => {
  assert.equal(
    getVideoEmbedUrl("https://www.youtube.com/watch?v=abc123"),
    "https://www.youtube-nocookie.com/embed/abc123"
  );
  assert.equal(
    getVideoEmbedUrl("https://youtu.be/abc123"),
    "https://www.youtube-nocookie.com/embed/abc123"
  );
  assert.equal(
    getVideoEmbedUrl("https://vimeo.com/123456789"),
    "https://player.vimeo.com/video/123456789"
  );
});

test("keeps civic media player links embeddable and ignores ordinary documents", () => {
  assert.equal(
    getVideoEmbedUrl("https://sanmateocounty.legistar.com/Video.aspx?Mode=Video&ID1=123"),
    "https://sanmateocounty.legistar.com/Video.aspx?Mode=Video&ID1=123"
  );
  assert.equal(
    getVideoEmbedUrl("https://sanmateocounty.legistar.com/Video.aspx?Mode=Granicus&ID1=123"),
    "https://sanmateocounty.legistar.com/Video.aspx?Mode=Granicus&ID1=123"
  );
  assert.equal(getVideoEmbedUrl("https://city.example/agenda.pdf"), null);
});

test("converts Swagit and Granicus recording links to embed URLs", () => {
  assert.equal(
    getVideoEmbedUrl("https://fostercity.new.swagit.com/videos/391680"),
    "https://fostercity.new.swagit.com/videos/391680/embed"
  );
  assert.equal(
    getVideoEmbedUrl("https://sanmateocounty.granicus.com/MediaPlayer.php?view_id=1&clip_id=123"),
    "https://sanmateocounty.granicus.com/MediaPlayer.php?view_id=1&clip_id=123&embed=1"
  );
  assert.equal(
    getVideoEmbedUrl("https://sanmateocounty.granicus.com/player/clip/1914?redirect=true"),
    "https://sanmateocounty.granicus.com/player/clip/1914?redirect=true"
  );
  assert.equal(
    getVideoEmbedUrl("https://sccgov.iqm2.com/Citizens/SplitView.aspx?Mode=Video&MeetingID=18233&Format=Agenda"),
    "https://sccgov.iqm2.com/Citizens/SplitView.aspx?Mode=Video&MeetingID=18233&Format=Agenda"
  );
});

test("finds unique meeting video documents", () => {
  const videos = getMeetingVideoDocuments([
    document({ id: "agenda", type: "Agenda", source_url: "https://city.example/agenda.pdf" }),
    document({ id: "video", type: "Media", source_url: "https://city.example/Video.aspx?ID=1" }),
    document({ id: "dupe", type: "Video", source_url: "https://city.example/Video.aspx?ID=1" }),
    document({ id: "label", label: "Meeting video", source_url: "https://city.example/watch/2" }),
    document({ id: "spanish-youtube", type: "Spanish Video", label: "Vídeo en español", source_url: "https://youtu.be/spanish" }),
    document({ id: "swagit", source_url: "https://fostercity.new.swagit.com/videos/391680" })
  ]);

  assert.deepEqual(videos.map((item) => item.id), ["video", "label", "spanish-youtube", "swagit"]);
});

test("finds video links in a meeting raw document payload", () => {
  const videos = getMeetingVideoDocuments([], {
    documents: [
      { type: "Agenda", label: "Agenda", url: "https://city.example/agenda.pdf" },
      { type: "Video", label: "Watch meeting", url: "https://city.example/watch/meeting-1" }
    ]
  });

  assert.equal(videos.length, 1);
  assert.equal(videos[0]?.source_url, "https://city.example/watch/meeting-1");
});

test("ignores generic IQM2 media center and inert video links", () => {
  const documents = [
    document({
      id: "iqm2-media-center",
      type: "Video",
      label: "Videos",
      source_url: "https://sccgov.iqm2.com/Citizens/Media.aspx"
    }),
    document({
      id: "iqm2-void-link",
      type: "Video",
      label: "Video",
      source_url: "javascript:void(0);"
    }),
    document({
      id: "iqm2-recording",
      type: "Video",
      label: "Video",
      source_url: "https://sccgov.iqm2.com/Citizens/SplitView.aspx?Mode=Video&MediaID=28330"
    })
  ];

  assert.deepEqual(getMeetingVideoDocuments(documents).map((item) => item.id), ["iqm2-recording"]);
  assert.deepEqual(getEmbeddableVideoDocuments(documents).map((item) => item.document.id), [
    "iqm2-recording"
  ]);

  assert.equal(
    getMeetingVideoDocuments([], {
      documents: [
        { type: "Video", label: "Videos", url: "https://sccgov.iqm2.com/Citizens/Media.aspx" },
        { type: "Video", label: "Video", url: "javascript:void(0);" }
      ]
    }).length,
    0
  );
});

test("only returns video documents with iframe-ready embed URLs", () => {
  const videos = getEmbeddableVideoDocuments([
    document({
      id: "generic-video-link",
      type: "Video",
      source_url: "https://sccgov.iqm2.com/Citizens/Detail_Meeting.aspx?ID=1"
    }),
    document({
      id: "swagit",
      type: "Video",
      source_url: "https://fostercity.new.swagit.com/videos/391680"
    }),
    document({
      id: "pdf-with-video-link",
      type: "Media",
      source_url: "https://sanmateocounty.legistar.com/View.ashx?M=E2&ID=1",
      extracted_text: "Watch: https://sanmateocounty.granicus.com/player/clip/1914?redirect=true"
    })
  ]);

  assert.deepEqual(
    videos.map((item) => [item.document.id, item.embedUrl]),
    [
      ["swagit", "https://fostercity.new.swagit.com/videos/391680/embed"],
      ["pdf-with-video-link", "https://sanmateocounty.granicus.com/player/clip/1914?redirect=true"]
    ]
  );
});
