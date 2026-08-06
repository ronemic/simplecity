import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getJurisdictionBySlug } from "@/lib/config/jurisdictions";
import { scrapeLegistarApiMeetings } from "@/lib/sources/legistar";

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
