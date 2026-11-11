import assert from "node:assert/strict";
import test from "node:test";
import {
  getJurisdictions,
  PUBLIC_JURISDICTION_OPTIONS
} from "@/lib/config/jurisdictions";
import { parseSantaBarbaraCityAgendaItems, parseSantaBarbaraCityInventory } from "@/lib/sources/santa-barbara-city";
import { isSantaMariaSectionHeading } from "@/lib/sources/escribe";
import { parseLompocAgendaItems, parseLompocCouncilRows } from "@/lib/sources/lompoc";

test("the four Santa Barbara cities share the county's regional database configuration", () => {
  const cities = ["santa-maria", "santa-barbara-city", "lompoc", "goleta"];
  const jurisdictions = getJurisdictions();
  const county = jurisdictions.find((jurisdiction) => jurisdiction.slug === "santa-barbara-county");
  assert.ok(county);
  for (const slug of cities) {
    const city = jurisdictions.find((jurisdiction) => jurisdiction.slug === slug);
    assert.ok(city, `${slug} is configured`);
    assert.equal(city.regionSlug, "santa-barbara");
    assert.equal(city.supabaseUrl, county.supabaseUrl);
    assert.equal(city.supabaseAnonKey, county.supabaseAnonKey);
    assert.equal(city.supabaseServiceRoleKey, county.supabaseServiceRoleKey);
    assert.equal(PUBLIC_JURISDICTION_OPTIONS.find((option) => option.slug === slug)?.parentCountySlug,
      "santa-barbara-county");
  }
});

test("Lompoc calendar links the official council event to its agenda PDF", () => {
  const html = '<table><tr><td class="event_title"><a href="/Home/Components/Calendar/Event/8599/67"><span itemprop="summary">Council Meeting</span></a></td>' +
    '<td class="event_datetime">11/17/2026 6:30 PM - 9:30 PM</td>' +
    '<td class="event_agenda"><a class="agenda_minutes_link" href="/home/showpublisheddocument/50911/639295760008930000">November 17 Draft Agenda</a></td>' +
    '<td class="event_minutes">Not Included</td></tr></table>';
  const rows = parseLompocCouncilRows(html, "https://www.cityoflompoc.com/government/committees-boards/city-council");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].externalId, "lompoc-calendar-8599");
  assert.equal(rows[0].documents[0].url, "https://www.cityoflompoc.com/home/showpublisheddocument/50911/639295760008930000");
});

test("Lompoc agenda parsing retains numbered items across PDF page headings", () => {
  const text = "23. Each televised Council meeting is closed captioned.\n1. Approval of Minutes of the Council Regular Meeting of August 4,\n2026.\n\n11/17/2026 DRAFT Agenda Page 2 of 4\n2. Adoption of a Resolution for Safe Routes.\nRecommendation: Council adopt the resolution.\n";
  const items = parseLompocAgendaItems(text, "https://www.cityoflompoc.com/agenda.pdf", "8599");
  assert.deepEqual(items.map((item) => item.agendaNumber), ["1", "2"]);
  assert.equal(items[0].title, "Approval of Minutes of the Council Regular Meeting of August 4, 2026.");
  assert.equal(items[1].recommendedAction, "Council adopt the resolution.");
});

test("Santa Barbara city reads nested OnBase meeting inventory without losing rows", () => {
  const html = '<script>showSearchResults(new SearchResults({"Meetings":[' +
    '{"ID":1,"Name":"Regular City Council Meeting","MeetingTypeName":"Council","Time":"2026-11-10T14:00:00-08:00","TimeString":"11/10/2026 2:00:00 PM","IsAgendaAvailable":true,"IsMinutesAvailable":false,"Documents":[{"Name":"Agenda {updated}"}]},' +
    '{"ID":2,"Name":"Special Meeting","MeetingTypeName":"Council","Time":"2026-11-11T14:00:00-08:00","TimeString":"11/11/2026 2:00:00 PM","IsAgendaAvailable":false,"IsMinutesAvailable":false}' +
    ']}));</script>';
  assert.deepEqual(parseSantaBarbaraCityInventory(html).map((meeting) => meeting.ID), [1, 2]);
  assert.throws(() => parseSantaBarbaraCityInventory("<html></html>"), /inventory was not found/);
});

test("Santa Barbara city keeps numbered agenda subjects and recommendations together", () => {
  const html = '<p>1. Subject: Adopt a housing plan</p><p>Recommendation: That Council adopt the plan.</p>' +
    '<p>2. Subject: Approve a park contract</p><p>Recommendation: That Council approve the contract.</p>';
  const items = parseSantaBarbaraCityAgendaItems(html, "https://example.gov/agenda", "42");
  assert.deepEqual(items.map((item) => item.agendaNumber), ["1", "2"]);
  assert.equal(items[0].title, "Adopt a housing plan");
  assert.equal(items[1].recommendedAction, "Recommendation: That Council approve the contract.");
  assert.equal(items[1].sourceUrl, "https://example.gov/agenda");
});

test("Santa Maria section labels do not become decision cards", () => {
  assert.equal(isSantaMariaSectionHeading("FINANCE DEPARTMENT"), true);
  assert.equal(isSantaMariaSectionHeading("RECONVENE TO REGULAR SESSION"), true);
  assert.equal(isSantaMariaSectionHeading("REPORT BY CITY MANAGER"), true);
  assert.equal(isSantaMariaSectionHeading("Adoption of a Resolution Approving an Agreement"), false);
});
