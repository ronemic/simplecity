import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryFromSlug,
  decisionCardSearchFilters,
  decisionMeetingSearchFilters,
  matchesDecisionFilters,
  matchesNormalizedDecisionSearchText,
  normalizeDecisionSearchText
} from "@/lib/utils/decisionFilters";
import type { SummaryCardRow } from "@/lib/types";

const card = {
  agenda_item: "Approve protected bicycle lanes",
  what_is_happening: ["The city will vote on a safer street design."],
  why_it_matters: "The project changes how residents travel downtown.",
  category_tags: ["Transportation", "Public Safety"],
  meetings: {
    meeting_type: "City Council",
    title: "City Council - Feb. 10, 2026",
    date_text: "Feb. 10, 2026"
  }
} as SummaryCardRow;

test("resolves decision category URL slugs", () => {
  assert.equal(categoryFromSlug("parks-environment"), "Parks & Environment");
  assert.equal(categoryFromSlug("not-a-category"), undefined);
});

test("filters decisions by category and search together", () => {
  assert.equal(matchesDecisionFilters(card, "bicycle", "Transportation"), true);
  assert.equal(matchesDecisionFilters(card, "city council", "Public Safety"), true);
  assert.equal(matchesDecisionFilters(card, "bicycle", "Housing"), false);
  assert.equal(matchesDecisionFilters(card, "airport", "Transportation"), false);
});

test("does not treat category labels as free-text search matches", () => {
  assert.equal(matchesDecisionFilters(card, "pub"), false);
  assert.equal(matchesDecisionFilters(card, "public safety"), false);
  assert.equal(matchesDecisionFilters(card, "protected bicycle"), true);
});

test("decision search includes visible meeting dates but excludes hidden titles and statuses", () => {
  const filters = decisionMeetingSearchFilters("%feb.%");

  assert.match(filters, /meeting_type\.ilike/);
  assert.match(filters, /date_text\.ilike/);
  assert.doesNotMatch(filters, /title|status/);
  assert.equal(matchesDecisionFilters(card, "feb."), true);
});

test("decision search normalizes punctuation and case", () => {
  assert.equal(normalizeDecisionSearchText("  FEB. 10 — 2026 "), "feb 10 2026");
  assert.equal(matchesDecisionFilters(card, "FEB"), true);
  assert.equal(matchesDecisionFilters(card, "Feb."), true);
});

test("decision date search matches complete numeric tokens", () => {
  assert.equal(matchesDecisionFilters(card, "feb 10"), true);
  assert.equal(matchesDecisionFilters(card, "feb 1"), false);
  assert.equal(matchesNormalizedDecisionSearchText("Feb 24", "feb 4"), false);
  assert.equal(matchesNormalizedDecisionSearchText("Feb 4", "feb 4"), true);
});

test("decision search ignores a hidden meeting title that contains the query", () => {
  const hiddenTitleOnly = {
    ...card,
    meetings: {
      ...card.meetings,
      title: "City Council - Feb. 4, 2026",
      date_text: "Feb. 24, 2026"
    }
  } as SummaryCardRow;

  assert.equal(matchesDecisionFilters(hiddenTitleOnly, "feb 4"), false);
});

test("decision search excludes internal card status values", () => {
  const filters = decisionCardSearchFilters("%upcoming%", ["meeting-1"]);

  assert.match(filters, /agenda_item\.ilike/);
  assert.match(filters, /what_is_happening\.ilike/);
  assert.match(filters, /why_it_matters\.ilike/);
  assert.match(filters, /meeting_id\.in/);
  assert.doesNotMatch(filters, /status\.ilike/);
});
