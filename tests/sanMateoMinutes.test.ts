import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getJurisdictionBySlug } from "../lib/config/jurisdictions";
import { attachSanMateoCouncilMinutesFromLaterAgendas } from "../lib/db/sanMateoMinutes";
import {
  councilMinutesHeader,
  councilMinutesLabel,
  findCouncilMinutesAttachments,
  selectCouncilMinutesTarget
} from "../lib/sources/san-mateo-minutes";
import { parseMeetingDate } from "../lib/utils/date";

const AGENDA_URL = "https://sanmateo.primegov.com/Portal/Meeting?meetingTemplateId=11223";
const agendaItemHtml = readFileSync(
  new URL("./fixtures/san-mateo-2026-09-22-agenda-minutes-item.html", import.meta.url),
  "utf8"
);
const historyUrl = (id: string) =>
  `https://sanmateo.primegov.com/api/compilemeetingattachmenthistory/historyattachment/?historyId=${id}`;

test("reads San Mateo council minutes attachments from a later agenda", () => {
  const attachments = findCouncilMinutesAttachments(agendaItemHtml, AGENDA_URL);
  assert.deepEqual(
    attachments.map(({ label, day, kind }) => ({ label, day, kind })),
    [
      { label: "Att 1 - Minutes 2026-7-20 Special", day: "2026-07-20", kind: "Special" },
      { label: "Att 2 - Minutes 2026-7-20 Regular", day: "2026-07-20", kind: "Regular" }
    ]
  );
  assert.equal(attachments[0].url, historyUrl("f0ecf014-874a-4bdc-9c66-1f9151ee81fd"));
  // The staff report on the same item is not minutes.
  assert.ok(!attachments.some((attachment) => /Agenda Report/.test(attachment.label)));
});

test("ignores minutes-looking attachments on agendas without a council minutes item", () => {
  const html = agendaItemHtml.replace(/City Council Meeting Minutes/g, "Commission Minutes");
  assert.deepEqual(findCouncilMinutesAttachments(html, AGENDA_URL), []);
});

test("reads the meeting a San Mateo minutes document records from its own header", () => {
  assert.deepEqual(
    councilMinutesHeader("City Council Special Meeting Minutes – 7/20/2026 Page 1\nCOUNCIL MEMBERS"),
    { day: "2026-07-20", kind: "Special" }
  );
  assert.deepEqual(
    councilMinutesHeader("City Council Regular Meeting Minutes - 8/17/2026 Page 1"),
    { day: "2026-08-17", kind: "Regular" }
  );
  assert.equal(councilMinutesHeader("Planning Commission Meeting Minutes – 7/20/2026"), null);
});

test("matches minutes to the one council meeting of that day and kind", () => {
  const regular = { title: "City Council Regular Meeting", bodyName: "City Council", dateText: "Jul 20, 2026 07:00 PM" };
  const special = { title: "City Council Special Meeting", bodyName: "City Council", dateText: "Jul 20, 2026 05:30 PM" };
  const commission = { title: "Planning Commission Regular Meeting", bodyName: "Planning Commission", dateText: "Jul 20, 2026 07:00 PM" };
  const meetings = [regular, special, commission];

  assert.equal(selectCouncilMinutesTarget(meetings, { day: "2026-07-20", kind: "Regular" }), regular);
  assert.equal(selectCouncilMinutesTarget(meetings, { day: "2026-07-20", kind: "Special" }), special);
  assert.equal(selectCouncilMinutesTarget(meetings, { day: "2026-07-21", kind: "Regular" }), null);

  // Two special meetings on one day cannot be told apart by the attachment name.
  const secondSpecial = { ...special, title: "City Council Special Meeting: Public Employee Evaluation", dateText: "Jul 20, 2026 04:00 PM" };
  assert.equal(selectCouncilMinutesTarget([...meetings, secondSpecial], { day: "2026-07-20", kind: "Special" }), null);
});

test("labels attached minutes with their own date first, as outcome matching requires", () => {
  const label = councilMinutesLabel("2026-07-20", "Special", "Sep 22, 2026 07:00 PM");
  assert.equal(
    label,
    "Minutes of the July 20, 2026 Special Meeting (attached to the September 22, 2026 City Council agenda)"
  );
  assert.equal(parseMeetingDate(label)?.slice(0, 10), "2026-07-20");
});

type Row = Record<string, unknown>;

function fakeSupabase(tables: { meetings: Row[]; documents: Row[] }) {
  const upserts: Row[] = [];
  const query = (rows: Row[]) => {
    let result = rows;
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        result = result.filter((row) => row[column] === value);
        return builder;
      },
      gte: () => builder,
      order: () => builder,
      in: (column: string, values: unknown[]) => {
        result = result.filter((row) => values.includes(row[column]));
        return builder;
      },
      range: (from: number, to: number) => {
        result = result.slice(from, to + 1);
        return builder;
      },
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: result, error: null })
    };
    return builder;
  };
  const client = {
    from: (table: "meetings" | "documents") => ({
      ...query(tables[table]),
      upsert: async (rows: Row[]) => {
        upserts.push(...rows);
        return { error: null };
      }
    })
  };
  return { client: client as unknown as SupabaseClient, upserts };
}

function storedMeeting(id: string, title: string, dateText: string, templateId: number) {
  return {
    id,
    title,
    jurisdiction_name: "San Mateo",
    jurisdiction_slug: "san-mateo-city",
    platform: "primegov",
    date_text: dateText,
    time_text: null,
    status: "Past",
    source_url: `https://sanmateo.primegov.com/Portal/Meeting?meetingTemplateId=${templateId}`,
    raw: { title, bodyName: title, dateText, documents: [] }
  };
}

test("attaches readable, header-checked minutes from a past later agenda and stores them", async () => {
  const jurisdiction = getJurisdictionBySlug("san-mateo-city");
  assert.ok(jurisdiction);
  const { client, upserts } = fakeSupabase({
    meetings: [
      storedMeeting("jul20-special", "City Council Special Meeting", "Jul 20, 2026 05:30 PM", 11158),
      storedMeeting("jul20-regular", "City Council Regular Meeting", "Jul 20, 2026 07:00 PM", 11163),
      storedMeeting("sep22-regular", "City Council Regular Meeting", "Sep 22, 2026 07:00 PM", 11223)
    ],
    documents: []
  });
  const specialMinutes = "City Council Special Meeting Minutes – 7/20/2026 Page 1\nCALL TO ORDER at 5:30 p.m.";
  const [specialUrl, regularUrl] = findCouncilMinutesAttachments(agendaItemHtml, AGENDA_URL).map(
    (attachment) => attachment.url
  );
  const minutesText: Record<string, string> = {
    [specialUrl]: specialMinutes,
    // A mislabelled file: named Regular, but it holds the special meeting's minutes.
    [regularUrl]: specialMinutes
  };

  const fetched: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    fetched.push(url);
    if (url.includes("meetingTemplateId=11223")) return new Response(agendaItemHtml);
    if (url.includes("meetingTemplateId=")) return new Response("<html>No minutes item</html>");
    return new Response(new TextEncoder().encode(url));
  }) as typeof fetch;
  const pdfText = async (bytes: Uint8Array) => minutesText[new TextDecoder().decode(bytes)] || "";

  const gained = await attachSanMateoCouncilMinutesFromLaterAgendas(client, jurisdiction, () => undefined, {
    fetchImpl,
    pdfText
  });

  assert.deepEqual(gained.map((meeting) => meeting.id), ["jul20-special"]);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].meeting_id, "jul20-special");
  assert.equal(upserts[0].type, "Minutes");
  assert.equal(upserts[0].source_url, historyUrl("f0ecf014-874a-4bdc-9c66-1f9151ee81fd"));
  assert.match(String(upserts[0].label), /^Minutes of the July 20, 2026 Special Meeting/);
  assert.ok(fetched.includes(regularUrl), "the mislabelled file was downloaded and then rejected");
});

test("skips meetings that already have readable minutes", async () => {
  const jurisdiction = getJurisdictionBySlug("san-mateo-city");
  assert.ok(jurisdiction);
  const { client, upserts } = fakeSupabase({
    meetings: [
      storedMeeting("jul20-regular", "City Council Regular Meeting", "Jul 20, 2026 07:00 PM", 11163),
      storedMeeting("sep22-regular", "City Council Regular Meeting", "Sep 22, 2026 07:00 PM", 11223)
    ],
    documents: [
      { meeting_id: "jul20-regular", type: "Minutes", label: "Minutes", source_url: "https://example.test/m.pdf", extracted_text: "Minutes text", download_error: null },
      { meeting_id: "sep22-regular", type: "Minutes", label: "Minutes", source_url: "https://example.test/s.pdf", extracted_text: "Minutes text", download_error: null }
    ]
  });
  const fetchImpl = (async () => {
    throw new Error("nothing should be fetched");
  }) as unknown as typeof fetch;

  const gained = await attachSanMateoCouncilMinutesFromLaterAgendas(client, jurisdiction, () => undefined, { fetchImpl });
  assert.deepEqual(gained, []);
  assert.equal(upserts.length, 0);
});

test("minutes labelled with an evening meeting's date are read for its outcomes", async () => {
  const { extractMeetingOutcomeItems } = await import("../lib/outcomes/extractDecisionOutcome");
  const consentItem = (agendaNumber: string, title: string) => ({
    agendaNumber,
    itemType: "CONSENT CALENDAR",
    title,
    rowText: `${agendaNumber}. ${title}`
  });
  const minutesText = [
    "City Council Regular Meeting Minutes – 7/20/2026 Page 1",
    "CALL TO ORDER at 7:06 p.m.",
    "CONSENT CALENDAR",
    "The following items, 3 through 4, were considered routine by the City Council. After the titles were read by the City",
    "Clerk, the Mayor invited public comment; there were no requests to speak.",
    "Moved: Newsom, Seconded: Diaz Nash",
    "Ayes: Fernandez, Newsom, Loraine, and Diaz Nash",
    "Noes: None",
    "Motion passed 4-0.",
    "3. Marina Lagoon Operations and Maintenance Permit Assistance – Agreement",
    "Approve an agreement with WRA, Inc. for Marina Lagoon Operations and Maintenance Permit Assistance in the",
    "amount of $259,460; approve a contingency reserve in the amount of $50,000.",
    "4. Public Utility Easement Dedication Acceptance — Adoption",
    "Adopt a Resolution accepting a public utility easement dedication near 31-57 S. B Street.",
    "ADJOURNMENT",
    "The meeting adjourned at 9:41 p.m."
  ].join("\n");
  const meeting = (label: string) => ({
    title: "City Council Regular Meeting",
    bodyName: "City Council",
    jurisdictionName: "San Mateo",
    jurisdictionSlug: "san-mateo-city",
    platform: "primegov",
    dateText: "Jul 20, 2026 07:00 PM",
    status: "Past",
    items: [
      consentItem("3", "Marina Lagoon Operations and Maintenance Permit Assistance – Agreement"),
      consentItem("4", "Public Utility Easement Dedication Acceptance — Adoption")
    ],
    documents: [{
      type: "Minutes",
      label,
      url: "https://example.test/minutes.pdf",
      extractedText: minutesText
    }]
  }) as unknown as Parameters<typeof extractMeetingOutcomeItems>[0];

  const ownDate = extractMeetingOutcomeItems(
    meeting(councilMinutesLabel("2026-07-20", "Regular", "Sep 22, 2026 07:00 PM"))
  );
  assert.deepEqual(ownDate.items.map((item) => item.agendaNumber).sort(), ["3", "4"]);

  // Minutes that name another day still stay off this meeting.
  const otherDate = extractMeetingOutcomeItems(
    meeting(councilMinutesLabel("2026-07-21", "Regular", "Sep 22, 2026 07:00 PM"))
  );
  assert.equal(otherDate.items.length, 0);
});
