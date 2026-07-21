import assert from "node:assert/strict";
import test from "node:test";
import { getJurisdictionBySlug } from "../lib/config/jurisdictions";
import { classifyEastPaloAltoLink, normalizeEastPaloAltoRows } from "../lib/sources/east-palo-alto";

test("classifies East Palo Alto table links by label and column", () => {
  assert.equal(classifyEastPaloAltoLink("Agenda", "Agenda", "", "https://example.test/a.pdf"), "Agenda");
  assert.equal(classifyEastPaloAltoLink("View", "Agenda Packet", "", "https://example.test/p.pdf"), "Agenda Packet");
  assert.equal(classifyEastPaloAltoLink("View Details", "Event Link", "", "https://example.test/event/4"), "Meeting Details");
  assert.equal(classifyEastPaloAltoLink("Video", "Event Link", "", "https://youtube.com/watch?v=x"), "Video");
  assert.equal(classifyEastPaloAltoLink("Notice", "Agenda", "Meeting Cancelled", "https://example.test/c.pdf"), "Notice of Cancellation");
  assert.equal(classifyEastPaloAltoLink("", "Agendas", "", "https://example.test/a.pdf"), "Agenda");
  assert.equal(classifyEastPaloAltoLink("", "Minutes", "", "https://example.test/m.pdf"), "Minutes");
});

test("does not collapse dated meetings that share one committee landing page", () => {
  const jurisdiction = getJurisdictionBySlug("east-palo-alto");
  assert.ok(jurisdiction);
  const shared = "https://www.cityofepa.org/city-council";
  const meetings = normalizeEastPaloAltoRows([
    {
      bodyName: "City Council",
      dateTimeText: "Jul 7, 2026 - 06:00 PM",
      rowText: "City Council Jul 7, 2026",
      links: [{ label: "View Details", column: "View", url: shared }]
    },
    {
      bodyName: "City Council",
      dateTimeText: "Jul 21, 2026 - 06:00 PM",
      rowText: "City Council Jul 21, 2026",
      links: [{ label: "View Details", column: "View", url: shared }]
    }
  ], jurisdiction);

  assert.equal(meetings.length, 2);
  assert.notEqual(meetings[0].externalId, meetings[1].externalId);
});

test("resolves East Palo Alto protocol-relative Agenda links against Granicus", () => {
  assert.equal(
    new URL("//cityofepa.granicus.com/AgendaViewer.php?event_id=388", "https://cityofepa.granicus.com/ViewPublisher.php?view_id=1").toString(),
    "https://cityofepa.granicus.com/AgendaViewer.php?event_id=388"
  );
});

test("normalizes distinct East Palo Alto meeting bodies and preserves official resources", () => {
  const jurisdiction = getJurisdictionBySlug("east-palo-alto");
  assert.ok(jurisdiction);
  const meetings = normalizeEastPaloAltoRows([
    {
      bodyName: "Planning Commission",
      dateTimeText: "Jul 13, 2026 - 07:00 PM",
      rowText: "Planning Commission Jul 13, 2026 - 07:00 PM Agenda Agenda Packet",
      links: [
        { label: "Agenda", column: "Agenda", url: "https://www.cityofepa.org/a.pdf" },
        { label: "Agenda Packet", column: "Agenda Packet", url: "https://www.cityofepa.org/p.pdf" }
      ]
    },
    {
      bodyName: "City Council",
      dateTimeText: "Jul 13, 2026 - 06:00 PM",
      rowText: "City Council Jul 13, 2026 - 06:00 PM View Details",
      links: [{ label: "View Details", column: "Event Link", url: "https://www.cityofepa.org/event/2" }]
    }
  ], jurisdiction);
  assert.equal(meetings.length, 2);
  assert.equal(meetings[0].jurisdictionSlug, "east-palo-alto");
  assert.equal(meetings[0].bodyName, "Planning Commission");
  assert.equal(meetings[0].timeText, "07:00 PM");
  assert.deepEqual(meetings[0].documents.map((doc) => doc.type), ["Agenda", "Agenda Packet"]);
  assert.equal(meetings[1].meetingDetailsUrl, "https://www.cityofepa.org/event/2");
  assert.notEqual(meetings[0].externalId, meetings[1].externalId);
});
