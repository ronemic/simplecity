import assert from "node:assert/strict";
import test from "node:test";
import { SIMPLECITY_SYSTEM_PROMPT } from "@/lib/llm/prompts";

test("summarizer prompt includes transparency-worthy routine items", () => {
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Include transparency routine cards/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /approval of minutes/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Consent calendar summary/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /public comment periods/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /closed session items/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /meeting cancellations, continuances, and special meeting notices/);
  assert.match(
    SIMPLECITY_SYSTEM_PROMPT,
    /If no non-routine or transparency-worthy source-supported agenda items are visible/
  );
});

test("summarizer prompt requires structured and aligned summary points", () => {
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /whatIsHappening” must be an array of 1-3/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Never combine the points into one string/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /same number of points as its matching English card/);
});

test("summarizer prompt classifies topics from complete item context", () => {
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /agenda item's complete context/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Do not choose a topic from an isolated keyword/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Choose exactly one primary topic/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /no more than two topics/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Classify a work plan by the substantive service area/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /service charge, revenue, or tax-roll collection/);
});

test("summarizer prompt separates item status from participation and historical minutes", () => {
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Public comment availability and item status are independent/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /prior meeting minutes, historical vote results/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Never mark a current agenda item “Passed” or “Tabled”/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Consider every action requested of the current body/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /a substantive formal decision outranks discussion/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /consider adoption/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Use “Routine approval” only for approval of meeting minutes/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /Do not use it for a substantive contract, budget, permit/);
  assert.match(SIMPLECITY_SYSTEM_PROMPT, /even if the agenda does not mention a roll-call vote/);
});
