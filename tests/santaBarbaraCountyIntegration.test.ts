import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getJurisdictionBySlug } from "@/lib/config/jurisdictions";
import { scrapeLegistarApiMeetings } from "@/lib/sources/legistar";
import {
  classifyPlanningCommissionDocument,
  enrichSantaBarbaraPlanningCommissionItems,
  parseBoxSharedFolderHtml,
  parsePlanningCommissionFolder,
  SANTA_BARBARA_PLANNING_COMMISSION_BOX_URL,
  SANTA_BARBARA_PLANNING_COMMISSION_URL
} from "@/lib/sources/santa-barbara-county";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260805000000_add_santa_barbara_county_jurisdiction.sql",
    import.meta.url
  ),
  "utf8"
);
const bootstrap = readFileSync(new URL("../supabase/bootstrap_full.sql", import.meta.url), "utf8");
const workflow = readFileSync(
  new URL("../.github/workflows/santa-barbara-county-pipeline.yml", import.meta.url),
  "utf8"
);
const nightlyWorkflow = readFileSync(
  new URL("../.github/workflows/nightly-scrapers.yml", import.meta.url),
  "utf8"
);
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { scripts: Record<string, string> };
const pipeline = readFileSync(new URL("../lib/pipeline.ts", import.meta.url), "utf8");
const standaloneScraper = readFileSync(
  new URL("../scripts/scrape-legistar.ts", import.meta.url),
  "utf8"
);
const pipelineRunner = readFileSync(
  new URL("../scripts/run-pipeline.ts", import.meta.url),
  "utf8"
);

test("Santa Barbara County migration and complete bootstrap target its regional database", () => {
  for (const sql of [migration, bootstrap]) {
    assert.match(
      sql,
      /'santa-barbara-county',\s*'Santa Barbara County',\s*'santa-barbara'/
    );
  }
  assert.match(migration, /on conflict \(slug\) do update/i);
  assert.match(bootstrap, /alter table public\.jurisdictions enable row level security/i);
});

test("Santa Barbara County has scraper, pipeline, and scheduled workflow entry points", () => {
  assert.match(
    packageJson.scripts["scrape:santa-barbara-county"],
    /--jurisdiction=santa-barbara-county/
  );
  assert.match(
    packageJson.scripts["pipeline:santa-barbara-county"],
    /--jurisdiction=santa-barbara-county/
  );
  assert.match(workflow, /name: Santa Barbara County Pipeline/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /group: santa-barbara-county-pipeline/);
  assert.match(workflow, /npm run pipeline:santa-barbara-county/);
  assert.match(workflow, /--require-results-coverage/);
  assert.match(workflow, /NEXT_PUBLIC_SANTA_BARBARA_REGION_SUPABASE_URL/);
  assert.doesNotMatch(nightlyWorkflow, /santa-barbara-county/);
  assert.match(pipeline, /scrapeSantaBarbaraCountyMeetings/);
  assert.match(standaloneScraper, /scrapeSantaBarbaraCountyMeetings/);
  assert.match(pipelineRunner, /Summary coverage incomplete/);
  assert.match(pipelineRunner, /LLM failed for/);
});

test("Santa Barbara County Planning Commission uses the official county and Box sources", () => {
  assert.equal(
    SANTA_BARBARA_PLANNING_COMMISSION_URL,
    "https://www.countyofsb.org/pl-county-planning-commission"
  );
  assert.equal(
    SANTA_BARBARA_PLANNING_COMMISSION_BOX_URL,
    "https://cosantabarbara.app.box.com/s/q97rv82305oyfnbdjhcyxrrdhu3dgkqy"
  );
});

test("parses Box folder payloads and Planning Commission meeting statuses", () => {
  const html = `<script>Box.postStreamData = ${JSON.stringify({
    "/app-api/enduserapp/shared-folder": {
      items: [
        { type: "folder", id: 405882985896, name: "08-12-2026" },
        { type: "folder", id: 402499139390, name: "07-29-2026 (Canceled)" },
        { type: "file", id: 2302739682937, name: "Agenda.pdf", extension: "pdf" }
      ],
      pageCount: 2,
      pageNumber: 1
    }
  })};</script>`;
  const payload = parseBoxSharedFolderHtml(html);
  assert.equal(payload.items.length, 3);
  assert.equal(payload.pageCount, 2);

  const scheduled = parsePlanningCommissionFolder(payload.items[0]);
  const cancelled = parsePlanningCommissionFolder(payload.items[1]);
  assert.equal(scheduled?.dateText, "8/12/2026");
  assert.equal(scheduled?.cancelled, false);
  assert.equal(cancelled?.dateText, "7/29/2026");
  assert.equal(cancelled?.cancelled, true);
  assert.equal(
    parsePlanningCommissionFolder({
      type: "folder",
      id: 1,
      name: "08-05-2026 (to be adjourned)"
    })?.cancelled,
    true
  );
  assert.equal(parsePlanningCommissionFolder(payload.items[2]), null);
});

test("classifies marked agendas as official Planning Commission result documents", () => {
  assert.equal(classifyPlanningCommissionDocument("Agenda.pdf"), "Agenda");
  assert.equal(classifyPlanningCommissionDocument("Marked Agenda.pdf"), "Minutes");
  assert.equal(classifyPlanningCommissionDocument("06-03-26 Unapproved Minutes.pdf"), "Minutes");
  assert.equal(
    classifyPlanningCommissionDocument("Notice of Meeting Cancellation.pdf"),
    "Notice of Cancellation"
  );
  assert.equal(
    classifyPlanningCommissionDocument("Notice of Adjournment.pdf"),
    "Notice of Cancellation"
  );
});

test("parses Planning Commission agenda items and attaches marked-agenda results", () => {
  const meeting = {
    externalId: "santa-barbara-county:box-planning-commission:123",
    jurisdictionName: "Santa Barbara County",
    jurisdictionSlug: "santa-barbara-county",
    platform: "official-site",
    section: "Past Meetings",
    title: "County Planning Commission",
    bodyName: "County Planning Commission",
    meetingType: "County Planning Commission",
    dateText: "7/1/2026",
    timeText: "9:00 AM",
    location: null,
    rowText: "County Planning Commission | 7/1/2026",
    status: "Past" as const,
    source: SANTA_BARBARA_PLANNING_COMMISSION_URL,
    sourceUrl: SANTA_BARBARA_PLANNING_COMMISSION_URL,
    sectionUrl: SANTA_BARBARA_PLANNING_COMMISSION_URL,
    meetingDetailsUrl: SANTA_BARBARA_PLANNING_COMMISSION_BOX_URL,
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [
      {
        type: "Agenda" as const,
        label: "Agenda.pdf",
        url: "https://example.test/agenda.pdf",
        extractedText:
          "STANDARD AGENDA:\n1. 26TRM-00001 Hope Villas Tract Map Santa Barbara\nHearing on the request for a tentative tract map.\n2. 26RZN-00004 Airport Land Use Compatibility Plan Amendments Countywide\nHearing on proposed amendments."
      },
      {
        type: "Minutes" as const,
        label: "Marked Agenda — 7/1/2026",
        url: "https://example.test/marked-agenda.pdf",
        extractedText:
          "STANDARD AGENDA:\n1. 26TRM-00001 Hope Villas Tract Map Santa Barbara\nHearing on the request for a tentative tract map.\nACTION: Motion to accept a late submittal into the record.\nFord/Amerikaner Vote: 2-2; motion fails.\nACTION: Approved the project by taking these actions:\n1. Made the required findings.\n2. Approved the tract map.\nAmerikaner/Ford Vote: 4-0\n2. 26RZN-00004 Airport Land Use Compatibility Plan Amendments Countywide\nHearing on proposed amendments.\nACTION: Recommended that the Board approve the Airport Land Use Compatibility Plan amendments.\nAmerikaner/Ford Vote: 4-0.\nACTION: Recommended that the Board approve the Minor Coastal Land Use Plan oil and gas amendment.\nFord/Parke Vote: 3-1."
      }
    ],
    detailText: null
  };

  assert.equal(enrichSantaBarbaraPlanningCommissionItems([meeting]), 3);
  assert.equal(meeting.items?.[0].agendaNumber, "1");
  assert.equal(meeting.items?.[0].fileNumber, "26TRM-00001");
  assert.match(meeting.items?.[0].result || "", /Approved the project/);
  assert.equal(meeting.items?.[0].sourceUrl, "https://example.test/marked-agenda.pdf");
  assert.equal(meeting.items?.[1].title, "Airport Land Use Compatibility Plan amendments");
  assert.equal(meeting.items?.[1].agendaNumber, "2A");
  assert.match(meeting.items?.[1].result || "", /Vote: 4-0/);
  assert.equal(meeting.items?.[2].title, "Minor Coastal Land Use Plan oil and gas amendment");
  assert.equal(meeting.items?.[2].agendaNumber, "2B");
  assert.match(meeting.items?.[2].result || "", /Vote: 3-1/);
});

test("Legistar API maps stable item ids and official actions without Playwright", async () => {
  const jurisdiction = getJurisdictionBySlug("santa-barbara-county");
  assert.ok(jurisdiction);
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("/events/2559/eventitems")) {
      return Response.json([
        {
          EventItemId: 117535,
          EventItemAgendaNumber: "A-4)",
          EventItemMatterFile: "26-00311",
          EventItemMatterType: "Resolution to be Presented",
          EventItemTitle: "Adopt a Resolution proclaiming National Crime Victims’ Rights Week.",
          EventItemActionName: "Adopted",
          EventItemActionText: "The motion carried by the following vote.",
          EventItemPassedFlagName: "Pass",
          EventItemMatterId: 28780,
          EventItemMatterGuid: "7D124EEB-0F7C-4DE4-BD91-58B2739F14D5"
        }
      ]);
    }
    return Response.json([
      {
        EventId: 2559,
        EventBodyId: 1,
        EventBodyName: "BOARD OF SUPERVISORS",
        EventDate: "2026-07-14T00:00:00",
        EventTime: "9:00 AM",
        EventLocation: "Board Hearing Room",
        EventAgendaStatusName: "Approved",
        EventMinutesStatusName: "Approved",
        EventAgendaFile: "https://example.test/agenda.pdf",
        EventMinutesFile: "https://example.test/minutes.pdf",
        EventComment: null,
        EventInSiteURL: "https://santabarbara.legistar.com/MeetingDetail.aspx?LEGID=2559"
      }
    ]);
  };

  try {
    const result = await scrapeLegistarApiMeetings({
      jurisdiction,
      monthsBack: 1,
      monthsForward: 0,
      downloadDocuments: false
    });
    assert.equal(result.totalMeetingCount, 1);
    assert.equal(result.meetings[0].externalId, "santa-barbara-county:legistar-event:2559");
    assert.equal(result.meetings[0].items?.[0].externalId, "legistar-event-item-117535");
    assert.equal(result.meetings[0].items?.[0].action, "Adopted");
    assert.equal(result.meetings[0].items?.[0].result, "Pass");
    assert.ok(requestedUrls[0].includes("EventBodyId+eq+1"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
