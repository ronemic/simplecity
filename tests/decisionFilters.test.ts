import assert from "node:assert/strict";
import test from "node:test";
import { categoryFromSlug, matchesDecisionFilters } from "@/lib/utils/decisionFilters";
import type { SummaryCardRow } from "@/lib/types";

const card = {
  agenda_item: "Approve protected bicycle lanes",
  what_is_happening: ["The city will vote on a safer street design."],
  why_it_matters: "The project changes how residents travel downtown.",
  category_tags: ["Transportation", "Public Safety"],
  meetings: { title: "City Council" }
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
