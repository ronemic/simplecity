import assert from "node:assert/strict";
import test from "node:test";
import {
  requireValidJurisdictionSlug,
  type JurisdictionSlug
} from "../lib/config/jurisdictions";
import {
  electionsPromoHref,
  PROPOSITION_GROUPS,
  type Localized
} from "../lib/elections/california2026";
import {
  countyFor,
  COUNTY_ORDER,
  getBallotFor,
  LOCAL_CONTESTS,
  LOCAL_MEASURES,
  type LocalContest,
  type LocalMeasure
} from "../lib/elections/local2026";

const text: Localized = { en: "Text.", es: "Texto." };

function measure(id: string, scope: LocalMeasure["scope"], appearsIn: JurisdictionSlug[]): LocalMeasure {
  return {
    id,
    letter: id,
    body: text,
    scope,
    appearsIn,
    allAddresses: true,
    kind: "tax",
    threshold: "majority",
    placedBy: "body",
    title: text,
    summary: text,
    yes: text,
    no: text,
    officialUrl: "https://example.gov"
  };
}

const MEASURES = [
  measure("SMH", "city", ["san-mateo-city"]),
  measure("W", "school", ["san-mateo-county", "foster-city", "san-mateo-city"]),
  measure("L", "county", ["san-mateo-county", "foster-city", "san-mateo-city", "menlo-park", "east-palo-alto", "redwood-city"]),
  measure("MVF", "city", ["mountain-view"]),
  measure("SFA", "city", ["san-francisco"])
];
const CONTESTS: LocalContest[] = [
  { jurisdiction: "foster-city", office: text, seats: text, officialUrl: "https://example.gov" },
  { jurisdiction: "san-mateo-city", office: text, seats: text, officialUrl: "https://example.gov" }
];

function letters(selection: Parameters<typeof getBallotFor>[0]) {
  return getBallotFor(selection, MEASURES, CONTESTS).flatMap((section) =>
    section.measures.map((item) => item.letter || item.id)
  );
}

test("a city sees its own measures plus the county and district measures that list it", () => {
  assert.deepEqual(letters("foster-city"), ["L", "W"]);
  assert.deepEqual(letters("san-mateo-city"), ["SMH", "L", "W"]);
  assert.deepEqual(letters("menlo-park"), ["L"]);
});

test("a county sees every covered city's measures and races in it", () => {
  const [section] = getBallotFor("san-mateo-county", MEASURES, CONTESTS);
  assert.equal(section.county, "san-mateo-county");
  assert.deepEqual(section.measures.map((item) => item.letter || item.id), ["SMH", "L", "W"]);
  assert.equal(section.contests.length, 2);
});

test("all returns one section per county in a fixed order", () => {
  const sections = getBallotFor("all", MEASURES, CONTESTS);
  assert.deepEqual(sections.map((section) => section.county), COUNTY_ORDER);
  assert.deepEqual(letters("all"), ["SFA", "SMH", "L", "W", "MVF"]);
});

test("places with no measures return an empty section instead of throwing", () => {
  assert.deepEqual(getBallotFor("santa-barbara-county", MEASURES, CONTESTS)[0].measures, []);
  assert.deepEqual(getBallotFor("los-altos-school-district", MEASURES, CONTESTS)[0].measures, []);
});

test("every covered jurisdiction maps to a county", () => {
  assert.equal(countyFor("san-mateo-city"), "san-mateo-county");
  assert.equal(countyFor("los-altos-school-district"), "santa-clara-county");
  assert.equal(countyFor("san-francisco"), "san-francisco");
  assert.equal(countyFor("santa-barbara-county"), "santa-barbara-county");
});

function assertLocalized(value: Localized | undefined, label: string) {
  if (!value) return;
  assert.ok(value.en.trim(), `${label} needs English text`);
  assert.ok(value.es.trim(), `${label} needs Spanish text`);
}

test("local measures are complete, bilingual, and point at valid places", () => {
  const ids = new Set<string>();
  for (const item of LOCAL_MEASURES) {
    assert.ok(!ids.has(item.id), `duplicate measure id ${item.id}`);
    ids.add(item.id);
    for (const key of ["body", "title", "summary", "yes", "no", "cost", "debate"] as const) {
      assertLocalized(item[key], `${item.id}.${key}`);
    }
    assert.match(item.officialUrl, /^https:\/\//, `${item.id} needs an https official URL`);
    assert.ok(item.appearsIn.length > 0, `${item.id} must appear somewhere`);
    for (const slug of item.appearsIn) requireValidJurisdictionSlug(slug);
    if (item.placement) {
      assert.match(item.placement.cardId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      assert.match(item.placement.date, /^2026-\d{2}-\d{2}$/);
      assertLocalized(item.placement.body, `${item.id}.placement.body`);
    }
  }
});

const COVERED_PLACES: JurisdictionSlug[] = [
  "foster-city", "san-mateo-city", "menlo-park", "east-palo-alto", "redwood-city",
  "mountain-view", "los-altos", "los-altos-hills", "los-altos-school-district"
];

test("countywide measures list every covered place in their county", () => {
  for (const item of LOCAL_MEASURES.filter((m) => m.scope === "county" && m.allAddresses)) {
    for (const county of COUNTY_ORDER.filter((slug) => item.appearsIn.includes(slug))) {
      for (const place of COVERED_PLACES.filter((slug) => countyFor(slug) === county)) {
        assert.ok(item.appearsIn.includes(place), `${item.id} should list ${place}`);
      }
    }
  }
});

test("local contests are bilingual and link to an official page", () => {
  for (const contest of LOCAL_CONTESTS) {
    requireValidJurisdictionSlug(contest.jurisdiction);
    assertLocalized(contest.office, `${contest.jurisdiction} office`);
    assertLocalized(contest.seats, `${contest.jurisdiction} seats`);
    assert.match(contest.officialUrl, /^https:\/\//);
  }
});

test("statewide propositions are unchanged by the card refactor", () => {
  assert.equal(PROPOSITION_GROUPS.flatMap((group) => group.propositions).length, 14);
});

test("election promos carry the reader's place and language", () => {
  assert.equal(electionsPromoHref("san-mateo-city", "en"), "/elections?jurisdiction=san-mateo");
  assert.equal(electionsPromoHref("all", "es"), "/elections?jurisdiction=all&lang=es");
});
