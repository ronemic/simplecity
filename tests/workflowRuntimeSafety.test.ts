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

test("pipeline uses workload-aware paid-work ceilings and runtime deadlines", () => {
  assert.match(pipeline, /getPipelineLlmBudgetLimits/);
  assert.doesNotMatch(pipeline, /MAX_SUMMARY_GENERATIONS_PER_PIPELINE/);
  assert.doesNotMatch(pipeline, /MAX_AGENDA_ITEM_RECOVERIES_PER_PIPELINE/);
  assert.match(pipeline, /recordDeadline\("LLM summarization"\)/);
  assert.match(pipeline, /deadlineExceeded\(\) \|\|[\s\S]*reconciledOutcomeMeetingIds/);
});

test("multi-jurisdiction runs do not share one LLM budget", () => {
  assert.doesNotMatch(
    pipeline,
    /runWithLlmProcessBudget\(\s*\(\) => runJurisdictionPipelinesInternal/
  );
});

test("pipeline exposes summary queue progress and live LLM usage", () => {
  assert.match(pipeline, /Summary queue:/);
  assert.match(pipeline, /Summary progress:/);
  assert.match(pipeline, /meeting\(s\) processed/);
  assert.match(pipeline, /LLM budget: requests/);
  assert.match(pipeline, /estimated\/actual tokens/);
});
