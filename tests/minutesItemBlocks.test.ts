import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractDecisionOutcome } from "../lib/outcomes/extractDecisionOutcome";

type Meeting = Parameters<typeof extractDecisionOutcome>[1];
type Card = Parameters<typeof extractDecisionOutcome>[0];

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

function meetingWithMinutes(
  slug: string,
  title: string,
  dateText: string,
  items: { agendaNumber: string; title: string; itemType?: string | null; externalId?: string; rowText?: string }[],
  minutesText: string
) {
  return {
    title,
    bodyName: title,
    jurisdictionSlug: slug,
    dateText,
    status: "Past",
    items: items.map((item) => ({ rowText: `${item.agendaNumber}. ${item.title}`, ...item })),
    documents: [{ type: "Minutes", label: "Minutes", url: "https://example.test/minutes.pdf", extractedText: minutesText }]
  } as unknown as Meeting;
}

const card = (sourceItemId: string, agendaItem: string) =>
  ({ id: sourceItemId, source_item_id: sourceItemId, agenda_item: agendaItem, source_url: null }) as unknown as Card;

test("a presentation listed before CONSENT CALENDAR does not take the calendar's vote", () => {
  // San Mateo, Aug 17, 2026: item 1 is a JobTrain presentation, followed by
  // the CONSENT CALENDAR heading and the calendar's "Motion passed 5-0".
  const meeting = meetingWithMinutes("san-mateo-city", "City Council Regular Meeting", "Aug 17, 2026 07:00 PM", [
    {
      agendaNumber: "1",
      itemType: "Roll Call",
      title: "JobTrain — Informational",
      externalId: "city-council-regular-meeting-item-1",
      rowText: "Agenda section: Roll Call. 1 JobTrain — Informational DOWNLOAD CONSENT CALENDAR All matters listed under the Consent Calendar are considered by the Council to be routine and will be enacted by one motion without discussion."
    },
    {
      agendaNumber: "2",
      itemType: "CONSENT CALENDAR",
      title: "City Council Meeting Minutes — Approval",
      externalId: "city-council-regular-meeting-item-2"
    },
    {
      agendaNumber: "3",
      itemType: "CONSENT CALENDAR",
      title: "Polymer Injection System Procurement — Adoption",
      externalId: "city-council-regular-meeting-item-3",
      rowText: "Agenda section: CONSENT CALENDAR. 3 Polymer Injection System Procurement — Adoption Adopt a Resolution authorizing the selection of Netzsch brand polymer injection rings and pumps for the Polymer Injection System Project."
    }
  ], fixture("san-mateo-2026-08-17-minutes-excerpt.txt"));

  assert.equal(
    extractDecisionOutcome(card("city-council-regular-meeting-item-1", "Information about JobTrain workforce program"), meeting),
    null
  );
  // The consent items themselves still carry the calendar's vote.
  assert.equal(
    extractDecisionOutcome(card("city-council-regular-meeting-item-3", "Adopt polymer injection system procurement resolution"), meeting)?.vote,
    "5–0"
  );
});

test("an address that starts with the item number does not stand in for the item heading", () => {
  // Santa Clara County minutes open with "70 West Hedding Street", which used
  // to be read as the start of item 70.
  const meeting = meetingWithMinutes("santa-clara-county", "Board of Supervisors - Regular Meeting", "Aug 11, 2026", [
    {
      agendaNumber: "70",
      itemType: null,
      externalId: "board-of-supervisors-regular-meeting-70",
      title: "Consider recommendations from the Commission on the Status of Women (CSW) relating to State legislation affecting women and girls."
    }
  ], fixture("santa-clara-county-2026-08-11-minutes-excerpt.txt"));

  const outcome = extractDecisionOutcome(
    card("board-of-supervisors-regular-meeting-70", "Review CSW recommendations on state bills affecting women"),
    meeting
  );
  assert.equal(outcome?.kind, "approved");
  assert.equal(outcome?.matchedAgendaNumber, "70");
});
