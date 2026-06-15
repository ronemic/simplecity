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
