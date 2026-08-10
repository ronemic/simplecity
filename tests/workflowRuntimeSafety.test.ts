import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nightlyWorkflow = readFileSync(
  new URL("../.github/workflows/nightly-scrapers.yml", import.meta.url),
  "utf8"
);
const pipeline = readFileSync(new URL("../lib/pipeline.ts", import.meta.url), "utf8");

test("nightly workflows do not rerun an entire paid pipeline after failure", () => {
  assert.doesNotMatch(nightlyWorkflow, /pipeline_args=/);
  assert.doesNotMatch(nightlyWorkflow, /pipeline failed; waiting/i);
  assert.doesNotMatch(nightlyWorkflow, /pipeline stopped; waiting/i);
});

test("pipeline has non-configurable paid-work safety ceilings", () => {
  assert.match(pipeline, /MAX_SUMMARY_GENERATIONS_PER_PIPELINE = 30/);
  assert.match(pipeline, /MAX_AGENDA_ITEM_RECOVERIES_PER_PIPELINE = 8/);
  assert.match(pipeline, /recordDeadline\("LLM summarization"\)/);
  assert.match(pipeline, /deadlineExceeded\(\) \|\|[\s\S]*reconciledOutcomeMeetingIds/);
});
