import assert from "node:assert/strict";
import test from "node:test";
import {
  MENLO_PARK_MISSING_SUPABASE_CONFIG_MESSAGE,
  getJurisdictionBySlug,
  getServiceSupabaseClientForJurisdiction,
  requireValidJurisdictionSlug,
  toPublicJurisdictionSlug
} from "@/lib/config/jurisdictions";
import {
  classifyMenloParkLink,
  enrichMenloParkMeetingTimesFromAgendaText,
  extractMenloParkAgendaTimeText,
  filterMenloParkMeetingsByDateWindow,
  getMenloParkBodies,
  normalizeMenloParkRows,
  type MenloParkExtractedRow
} from "@/lib/sources/menlo-park";
import { buildLlmReadyMeeting } from "@/lib/scraper/prepareLlmInput";

function row(overrides: Partial<MenloParkExtractedRow>): MenloParkExtractedRow {
  return {
    bodyName: "City Council",
    sectionId: "section-2",
    sectionUrl: "https://www.menlopark.gov/Agendas-and-minutes#section-2",
    year: "2026",
    dateText: "June 23, 2026",
    rowText: "June 23, 2026 Agenda packet Minutes Video Vídeo en español",
    links: [],
    actionLinks: [],
    ...overrides
  };
}

test("Menlo Park is registered as an official-site jurisdiction", () => {
  const menloPark = getJurisdictionBySlug("menlo-park");

  assert.equal(requireValidJurisdictionSlug("menlo-park"), "menlo-park");
  assert.equal(menloPark?.name, "Menlo Park");
  assert.equal(menloPark?.officialName, "City of Menlo Park");
  assert.equal(menloPark?.platform, "official-site");
  assert.equal(menloPark?.timezone, "America/Los_Angeles");
  assert.equal(menloPark?.sourceUrl, "https://www.menlopark.gov/Agendas-and-minutes");
  assert.equal(toPublicJurisdictionSlug("menlo-park"), "menlo-park");
});

test("Menlo Park service client requires Menlo Park Supabase config", () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.MENLO_PARK_SUPABASE_SERVICE_ROLE_KEY
  };

  delete process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_ANON_KEY;
  delete process.env.MENLO_PARK_SUPABASE_SERVICE_ROLE_KEY;

  try {
    assert.throws(
      () => getServiceSupabaseClientForJurisdiction("menlo-park"),
      (error) =>
        error instanceof Error &&
        error.message === MENLO_PARK_MISSING_SUPABASE_CONFIG_MESSAGE
    );
  } finally {
    if (previous.url === undefined) {
      delete process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_URL = previous.url;
    }

    if (previous.anonKey === undefined) {
      delete process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_MENLO_PARK_SUPABASE_ANON_KEY = previous.anonKey;
    }

    if (previous.serviceRoleKey === undefined) {
      delete process.env.MENLO_PARK_SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.MENLO_PARK_SUPABASE_SERVICE_ROLE_KEY = previous.serviceRoleKey;
    }
  }
});

test("classifies Menlo Park official-site links by visible label first", () => {
  assert.equal(
    classifyMenloParkLink("Cancellation notice (PDF, 94KB)", "https://example.com/file"),
    "Notice of Cancellation"
  );
  assert.equal(
    classifyMenloParkLink("Special event notice (PDF, 114KB)", "https://example.com/file"),
    "Special Event Notice"
  );
  assert.equal(
    classifyMenloParkLink("Early staff report release (PDF, 3MB)", "https://example.com/file"),
    "Early Staff Report Release"
  );
  assert.equal(
    classifyMenloParkLink("Vídeo en español", "https://youtu.be/example"),
    "Spanish Video"
  );
  assert.equal(
    classifyMenloParkLink("Spanish Interpretation Request Form", "https://us.openforms.com/form"),
    "Spanish Interpretation Form"
  );
  assert.equal(
    classifyMenloParkLink("Solicitud de interpretación en español.", "https://us.openforms.com/form"),
    "Spanish Interpretation Form"
  );
});

test("normalizes Menlo Park rows without merging separate bodies", () => {
  const jurisdiction = getJurisdictionBySlug("menlo-park");
  assert.ok(jurisdiction);

  const meetings = normalizeMenloParkRows(
    [
      row({
        links: [
          {
            label: "Agenda packet (PDF, 150KB)",
            url: "https://www.menlopark.gov/files/city-council-agenda.pdf",
            column: "Agenda"
          },
          {
            label: "Minutes (PDF, 1MB)",
            url: "https://www.menlopark.gov/files/city-council-minutes.pdf",
            column: "Minutes"
          },
          {
            label: "Video",
            url: "https://youtu.be/english-video",
            column: "Video"
          },
          {
            label: "Vídeo en español",
            url: "https://youtu.be/spanish-video",
            column: "Video"
          }
        ],
        actionLinks: [
          {
            label: "Join the City Council meeting Zoom",
            url: "https://us06web.zoom.us/j/example",
            column: null
          },
          {
            label: "Transportation services to a City Council meeting",
            url: "https://us.openforms.com/transportation",
            column: null
          }
        ]
      }),
      row({
        rowText: "June 23, 2026 Early staff report release (PDF, 3MB) n/a n/a",
        links: [
          {
            label: "Early staff report release (PDF, 3MB)",
            url: "https://www.menlopark.gov/files/early-staff-report.pdf",
            column: "Agenda"
          }
        ]
      }),
      row({
        bodyName: "Planning Commission",
        sectionId: "section-9",
        sectionUrl: "https://www.menlopark.gov/Agendas-and-minutes#section-9",
        dateText: "June 29, 2026",
        rowText: "June 29, 2026 Special event notice (PDF, 114KB) n/a n/a",
        links: [
          {
            label: "Special event notice (PDF, 114KB)",
            url: "https://www.menlopark.gov/files/special-event-notice.pdf",
            column: "Agenda"
          }
        ]
      })
    ],
    jurisdiction
  );

  assert.equal(meetings.length, 2);

  const cityCouncil = meetings.find((meeting) => meeting.bodyName === "City Council");
  assert.ok(cityCouncil);
  assert.equal(cityCouncil.jurisdictionSlug, "menlo-park");
  assert.equal(cityCouncil.platform, "official-site");
  assert.equal(cityCouncil.timeText, null);
  assert.ok(cityCouncil.externalId?.startsWith("menlo-park-official-site-city-council"));
  assert.ok(
    cityCouncil.documents.some((document) => document.type === "Early Staff Report Release")
  );
  assert.ok(cityCouncil.documents.some((document) => document.type === "Spanish Video"));
  assert.ok(cityCouncil.documents.some((document) => document.type === "Zoom"));
  assert.ok(cityCouncil.documents.some((document) => document.type === "Transportation Form"));
  assert.ok(
    cityCouncil.extractionNotes?.some((note) =>
      note.includes("Official Menlo Park page lists date but not meeting time")
    )
  );

  const planning = meetings.find((meeting) => meeting.bodyName === "Planning Commission");
  assert.equal(planning?.status, "Notice");
  assert.equal(planning?.sourceUrl, "https://www.menlopark.gov/files/special-event-notice.pdf");
});

test("filters Menlo Park meetings to one calendar month back and forward", () => {
  const jurisdiction = getJurisdictionBySlug("menlo-park");
  assert.ok(jurisdiction);

  const meetings = normalizeMenloParkRows(
    [
      row({ dateText: "May 19, 2026" }),
      row({ dateText: "June 30, 2026" }),
      row({ dateText: "July 13, 2026" }),
      row({ dateText: "August 31, 2026" }),
      row({ dateText: "September 1, 2026" })
    ],
    jurisdiction
  );

  const filtered = filterMenloParkMeetingsByDateWindow(
    meetings,
    1,
    1,
    new Date(2026, 6, 13)
  );

  assert.deepEqual(
    filtered.map((meeting) => meeting.dateText),
    ["June 30, 2026", "July 13, 2026", "August 31, 2026"]
  );
});

test("filters Menlo Park body config by body slug or section id", () => {
  assert.deepEqual(
    getMenloParkBodies("planning-commission").map((body) => body.bodyName),
    ["Planning Commission"]
  );
  assert.deepEqual(
    getMenloParkBodies("section-7").map((body) => body.bodyName),
    ["Library Commission"]
  );
});

test("extracts Menlo Park agenda times from labeled agenda text", () => {
  const text = `
    REGULAR MEETING AGENDA
    Date: 6/8/2026
    Time: 7:00 p.m.
    Location: City Council Chambers
  `;

  assert.equal(extractMenloParkAgendaTimeText(text), "7:00 p.m.");
  assert.equal(extractMenloParkAgendaTimeText("Time: 10 AM Location: Chambers"), "10:00 a.m.");
  assert.equal(
    extractMenloParkAgendaTimeText("The regular meeting begins at 6:00 p.m. in the Council Chambers."),
    "6:00 p.m."
  );
  assert.equal(
    extractMenloParkAgendaTimeText("PLANNING COMMISSION REGULAR MEETING 7 PM City Council Chambers"),
    "7:00 p.m."
  );
  assert.equal(
    extractMenloParkAgendaTimeText("The closed session will convene at 5:30 p.m."),
    "5:30 p.m."
  );
  assert.equal(
    extractMenloParkAgendaTimeText("Date: 6/23/2026 Time: 5:3 0 p.m. Location: City Council Chambers"),
    "5:30 p.m."
  );
  assert.equal(
    extractMenloParkAgendaTimeText("Date: 6/29/2026 Time: 5:3 0 – 6:30 p.m. Location: City Hall"),
    "5:30 p.m."
  );
  assert.equal(extractMenloParkAgendaTimeText("Submit comments up to 1 hour before meeting start time."), null);
});

test("enriches Menlo Park meetings with agenda PDF times", () => {
  const jurisdiction = getJurisdictionBySlug("menlo-park");
  assert.ok(jurisdiction);

  const [meeting] = normalizeMenloParkRows(
    [
      row({
        bodyName: "Planning Commission",
        sectionId: "section-9",
        sectionUrl: "https://www.menlopark.gov/Agendas-and-minutes#section-9",
        dateText: "June 8, 2026",
        rowText: "June 8, 2026 Agenda packet",
        links: [
          {
            label: "Agenda packet (PDF, 500KB)",
            url: "https://www.menlopark.gov/files/planning-agenda.pdf",
            column: "Agenda"
          }
        ]
      })
    ],
    jurisdiction
  );

  assert.equal(meeting.timeText, null);
  meeting.documents[0].extractedText = "Date: 6/8/2026 Time: 7:00 p.m. Location: City Council Chambers";

  assert.equal(enrichMenloParkMeetingTimesFromAgendaText([meeting]), 1);
  assert.equal(meeting.timeText, "7:00 p.m.");
  assert.ok(
    meeting.extractionNotes?.some((note) =>
      note.includes("Extracted meeting time (7:00 p.m.)")
    )
  );
});

test("LLM preparation enriches Menlo Park times after agenda text is available", async () => {
  const jurisdiction = getJurisdictionBySlug("menlo-park");
  assert.ok(jurisdiction);

  const [meeting] = normalizeMenloParkRows(
    [
      row({
        bodyName: "Planning Commission",
        sectionId: "section-9",
        sectionUrl: "https://www.menlopark.gov/Agendas-and-minutes#section-9",
        dateText: "June 8, 2026",
        rowText: "June 8, 2026 Agenda packet",
        links: [
          {
            label: "Agenda packet (PDF, 500KB)",
            url: "https://www.menlopark.gov/files/planning-agenda.pdf",
            column: "Agenda"
          }
        ]
      })
    ],
    jurisdiction
  );
  meeting.documents[0].extractedText =
    "PLANNING COMMISSION REGULAR MEETING 7 PM City Council Chambers";

  const prepared = await buildLlmReadyMeeting(meeting);

  assert.equal(prepared.timeText, "7:00 p.m.");
  assert.equal(prepared.id, "june-8-2026-7-00-p-m-planning-commission-june-8-2026");
  assert.ok(prepared.extractionNotes.some((note) => note.includes("Extracted meeting time")));
});
