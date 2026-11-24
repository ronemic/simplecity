import assert from "node:assert/strict";
import test from "node:test";
import { findMisfiledMinutesMoves } from "../lib/db/misfiledMinutes";
import { classifyDecisionOutcome, extractDecisionOutcome } from "../lib/outcomes/extractDecisionOutcome";
import { minutesRecordedDay } from "../lib/outcomes/minutesRecordedDay";
import type { LlmReadyMeeting } from "../lib/types";

type Card = Parameters<typeof extractDecisionOutcome>[0];

function meeting(id: string, title: string, dateText: string, minutes?: { url: string; text: string }) {
  return {
    id,
    title,
    bodyName: title,
    jurisdictionSlug: "los-altos-hills",
    dateText,
    status: "Past",
    items: [],
    documents: minutes ? [{ type: "Minutes", label: "Minutes", url: minutes.url, extractedText: minutes.text }] : []
  } as unknown as LlmReadyMeeting;
}

const SEP_17_SPECIAL = "Town of Los Altos Hills\nCity Council Special Meeting Minutes\nThursday, September 17, 2026 at 5:00 P.M.\nCALL TO ORDER";
const SEP_17_REGULAR = "Approved October 15, 2026\nTown of Los Altos Hills\nCity Council Regular Meeting Minutes\nThursday, September 17, 2026 at 6:00 P.M.";

test("reads the day minutes record from their header", () => {
  assert.equal(minutesRecordedDay(SEP_17_REGULAR), "2026-09-17");
  assert.equal(
    minutesRecordedDay("Carpinteria Open Space Management Advisory Board Regular Meeting Minutes October 22, 2026, at 3:00 PM"),
    "2026-10-22"
  );
  assert.equal(minutesRecordedDay("A. Approval of the City Council Special Meeting Minutes June 18, 2026"), null);
  assert.equal(minutesRecordedDay("16. Adjourn. The next regular meeting is scheduled for Friday, July 10, 2026"), null);
});

test("attaches minutes filed on a later meeting to the meeting they record", () => {
  const meetings = [
    meeting("oct15-special", "City Council Special Meeting October 15, 2026", "Oct 15, 2026", { url: "https://example.test/9278", text: SEP_17_SPECIAL }),
    meeting("oct15-regular", "City Council Regular Meeting October 15, 2026", "Oct 15, 2026", { url: "https://example.test/9279", text: SEP_17_REGULAR }),
    meeting("sep17-special", "City Council Special Meeting September 17, 2026", "Sep 17, 2026"),
    meeting("sep17-regular", "City Council Regular Meeting September 17, 2026", "Sep 17, 2026"),
    meeting("sep17-history", "History Committee Regular Meeting", "Sep 17, 2026")
  ];
  const moves = findMisfiledMinutesMoves(meetings);
  assert.deepEqual(
    moves.map((move) => [move.document.url, move.target.id]),
    [["https://example.test/9278#minutes-2026-09-17", "sep17-special"], ["https://example.test/9279#minutes-2026-09-17", "sep17-regular"]]
  );
  assert.equal(moves[1].document.label, "Minutes of September 17, 2026 (filed with the Oct 15, 2026 meeting)");

  // Once copied (or when the meeting has minutes of its own) nothing moves again.
  moves.forEach((move) => move.target.documents.push(move.document));
  assert.deepEqual(findMisfiledMinutesMoves(meetings), []);
});

test("a minutes-approval vote is only the result of a card about minutes", () => {
  // Carpinteria, Oct 22, 2026: the agenda's item 3 is the priority list, the
  // minutes' item 3 approves the Sep 17 minutes.
  const minutes = `Carpinteria Open Space Management Advisory Board Regular Meeting Minutes October 22, 2026
3. Approve the minutes of the Regular Meeting held on September 17, 2026
a. Member Lewis moved to approve the minutes of the September 17, 2026, Regular
Meeting, as amended. The motion was seconded by Member Vernon and carried unanimously.
4. COSMAB Priority List
a. A discussion was led by Member Vernon regarding COSMABs priorities for the year.
`;
  const oct22 = {
    ...meeting("oct22", "Open Space Management Advisory Board Meeting", "Oct 22, 2026", { url: "https://example.test/6044", text: minutes }),
    jurisdictionSlug: "carpinteria",
    items: [{ externalId: "cosmab-item-3", agendaNumber: "3", title: "COSMAB Priority List", rowText: "3 COSMAB Priority List" }]
  } as unknown as LlmReadyMeeting;
  const card = (agendaItem: string) =>
    ({ id: agendaItem, source_item_id: "cosmab-item-3", agenda_item: agendaItem, source_url: null }) as unknown as Card;

  assert.equal(extractDecisionOutcome(card("COSMAB Priority List"), oct22), null);
});

test("a passed motion's own purpose outranks a stray 'continued'", () => {
  assert.equal(
    classifyDecisionOutcome(
      "MOTION MADE: Council Member Tyson moved to direct staff to prepare and send a letter supporting continuation of the joint volunteer recognition event and encouraging continued communication. MOTION CARRIED: 5-0."
    ),
    "approved"
  );
  assert.equal(classifyDecisionOutcome("Motion to continue the item to May 5 carried 4-0."), "continued");
  assert.equal(classifyDecisionOutcome("The public hearing was continued to October 6."), "continued");
});
