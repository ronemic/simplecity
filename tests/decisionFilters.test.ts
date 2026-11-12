import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryFromSlug,
  decisionCardSearchFilters,
  decisionSearchTokens,
  matchesDecisionFilters,
  matchesNormalizedDecisionSearchText,
  normalizedDecisionSearchFields,
  normalizedTextMatchesSearchTokens,
  normalizeDecisionSearchText
} from "@/lib/utils/decisionFilters";
import { SCHOOL_CATEGORIES } from "@/lib/constants";
import type { SummaryCardRow } from "@/lib/types";

const card = {
  agenda_item: "Approve protected bicycle lanes",
  what_is_happening: ["The city will vote on a safer street design."],
  why_it_matters: "The project changes how residents travel downtown.",
  who_it_affects: ["Downtown commuters", "Families with children"],
  category_tags: ["Transportation", "Public Safety"],
  meetings: {
    meeting_type: "City Council",
    title: "City Council - Feb. 10, 2026",
    date_text: "Feb. 10, 2026"
  }
} as SummaryCardRow;

test("resolves decision category URL slugs", () => {
  assert.equal(categoryFromSlug("parks-environment"), "Parks & Environment");
  assert.equal(
    categoryFromSlug("school-buildings-grounds", SCHOOL_CATEGORIES),
    "School Buildings & Grounds"
  );
  assert.equal(categoryFromSlug("parks-environment", SCHOOL_CATEGORIES), undefined);
  assert.equal(categoryFromSlug("not-a-category"), undefined);
});

test("filters decisions by category and search together", () => {
  assert.equal(matchesDecisionFilters(card, "bicycle", "Transportation"), true);
  assert.equal(matchesDecisionFilters(card, "commuters", "Public Safety"), true);
  assert.equal(matchesDecisionFilters(card, "bicycle", "Housing"), false);
  assert.equal(matchesDecisionFilters(card, "airport", "Transportation"), false);
});

test("does not treat category labels as free-text search matches", () => {
  assert.equal(matchesDecisionFilters(card, "pub"), false);
  assert.equal(matchesDecisionFilters(card, "public safety"), false);
  assert.equal(matchesDecisionFilters(card, "protected bicycle"), true);
});

test("decision search only checks the four public summary fields", () => {
  assert.equal(matchesDecisionFilters(card, "bicycle"), true);
  assert.equal(matchesDecisionFilters(card, "safer street"), true);
  assert.equal(matchesDecisionFilters(card, "residents travel"), true);
  assert.equal(matchesDecisionFilters(card, "families"), true);
  assert.equal(matchesDecisionFilters(card, "city council"), false);
  assert.equal(matchesDecisionFilters(card, "feb 10"), false);
});

test("decision search normalizes punctuation and case", () => {
  assert.equal(normalizeDecisionSearchText("  FEB. 10 — 2026 "), "feb 10 2026");
  assert.equal(matchesDecisionFilters(card, "PROTECTED"), true);
  assert.equal(matchesDecisionFilters(card, "protected!"), true);
});

test("decision search matches complete numeric tokens", () => {
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

test("the prepared-text fast path agrees with the original word-by-word rule", () => {
  // The original rule, without the substring shortcut.
  const reference = (value: string, search: string) => {
    const haystack = normalizeDecisionSearchText(value).split(" ").filter(Boolean);
    const tokens = normalizeDecisionSearchText(search).split(" ").filter(Boolean);
    if (tokens.length === 0) return true;
    if (haystack.length < tokens.length) return false;
    return haystack.some((_, start) =>
      tokens.every((token, offset) => {
        const word = haystack[start + offset];
        if (!word) return false;
        return /^\d+$/u.test(token) ? word === token : word.includes(token);
      })
    );
  };
  const words = ["park", "parking", "4", "24", "2026", "Niño", "café", "street", "st", "re-zone", "", "budget", "bud", "A", "10", "1", "safer", "safe"];
  let seed = 7;
  const pick = () => words[(seed = (seed * 1103515245 + 12345) % 2147483648) % words.length];
  let checked = 0;
  for (let round = 0; round < 4000; round += 1) {
    const value = Array.from({ length: round % 7 }, pick).join(round % 3 ? " " : ", ");
    const search = Array.from({ length: 1 + (round % 3) }, pick).join(" ");
    const tokens = decisionSearchTokens(search);
    assert.equal(
      normalizedTextMatchesSearchTokens(normalizeDecisionSearchText(value), tokens),
      reference(value, search),
      `value=${JSON.stringify(value)} search=${JSON.stringify(search)}`
    );
    assert.equal(matchesNormalizedDecisionSearchText(value, search), reference(value, search));
    checked += 1;
  }
  assert.equal(checked, 4000);
});

test("prepared card fields are exactly the text the per-card matcher reads", () => {
  const sample = {
    id: "c1", agenda_item: "Approve Ad Hoc Committee on Café Permits", what_is_happening: ["Adds 4 parking spaces", "Costs $24,000"],
    why_it_matters: "Safer streets for families.", who_it_affects: ["Residents", "Niños"], category_tags: ["Transportation"]
  } as never;
  const fields = normalizedDecisionSearchFields(sample);
  assert.ok(fields.length >= 5);
  for (const search of ["temporary", "ad hoc", "cafe", "4", "24", "24 000", "ninos", "families", "zebra", "parking spaces", "spaces costs"]) {
    assert.equal(
      fields.some((field) => normalizedTextMatchesSearchTokens(field, decisionSearchTokens(search))),
      matchesDecisionFilters(sample, search),
      search
    );
  }
  assert.equal(matchesDecisionFilters(sample, "spaces costs"), false, "words in different fields never join");
});
