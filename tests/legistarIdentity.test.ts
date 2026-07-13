import assert from "node:assert/strict";
import test from "node:test";
import { makeLegistarMeetingExternalId } from "@/lib/sources/legistar";

test("uses official Legistar meeting identifiers instead of mutable meeting titles", () => {
  const url =
    "https://sanmateocounty.legistar.com/MeetingDetail.aspx?ID=1423223&GUID=E57BBD72-C2A3-4AF6-B0D0-0A4A5C0067A5&Options=info";

  assert.equal(
    makeLegistarMeetingExternalId("san-mateo-county", url, "fallback title"),
    "san-mateo-county:legistar-meeting:1423223:e57bbd72-c2a3-4af6-b0d0-0a4a5c0067a5"
  );
});

test("falls back to a deterministic slug when Legistar omits official identifiers", () => {
  assert.equal(
    makeLegistarMeetingExternalId("mountain-view", null, "7/14/2026 City Council"),
    "mountain-view-legistar-meeting-7-14-2026-city-council"
  );
});
