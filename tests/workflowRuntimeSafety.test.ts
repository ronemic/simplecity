import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nightlyWorkflow = readFileSync(
  new URL("../.github/workflows/nightly-scrapers.yml", import.meta.url),
  "utf8"
);
const pipeline = readFileSync(new URL("../lib/pipeline.ts", import.meta.url), "utf8");
const dedicatedWorkflows = [
  nightlyWorkflow,
  readFileSync(new URL("../.github/workflows/menlo-park-pipeline.yml", import.meta.url), "utf8"),
  readFileSync(new URL("../.github/workflows/santa-barbara-county-pipeline.yml", import.meta.url), "utf8"),
  readFileSync(
    new URL("../.github/workflows/los-altos-school-district-pipeline.yml", import.meta.url),
    "utf8"
  )
];

const losAltosSchoolDistrictWorkflow = dedicatedWorkflows.at(-1) ?? "";

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
  assert.match(pipeline, /OpenRouter budget: requests/);
  assert.match(pipeline, /estimated\/actual tokens/);
});

test("unchanged meetings bypass Monday minutes and outcome LLM work", () => {
  const workerStart = pipeline.indexOf("const summarizeTarget = async");
  const unchangedCheck = pipeline.indexOf("shouldSkipUnchangedSummary(", workerStart);
  const minutesCheck = pipeline.indexOf(
    "shouldReconcileMinutesWithoutGeneratingCards(",
    workerStart
  );
  assert.ok(unchangedCheck >= 0);
  assert.ok(minutesCheck > unchangedCheck);
  assert.match(
    pipeline,
    /source unchanged[\s\S]*reconciledOutcomeMeetingIds\.add\(item\.id\)/
  );
  assert.match(
    pipeline,
    /if \(canPersist[\s\S]*for \(const item of upserted\)[\s\S]*shouldSkipUnchangedSummary\([\s\S]*continue;/
  );
});

test("paid budget exhaustion stops the summary queue instead of fanning out blocked attempts", () => {
  assert.match(pipeline, /isLlmProcessBudgetExceededError/);
  assert.match(pipeline, /outcome === "budget-exhausted"/);
  assert.match(pipeline, /Stopping detailed LLM summaries because the OpenRouter safety budget is exhausted/);
});

test("official-source fallbacks complete the current source version", () => {
  assert.match(pipeline, /const completedSourceHash = item\.sourceHash/);
});

test("every scraper workflow exposes all five Groq keys for hybrid routing", () => {
  for (const workflow of dedicatedWorkflows) {
    for (const suffix of ["", "_2", "_3", "_4", "_5"]) {
      assert.match(workflow, new RegExp(`GROQ_API_KEY${suffix}:`));
    }
    assert.match(workflow, /GROQ_MODEL:/);
  }
});

test("Los Altos School District has an isolated bounded daily workflow", () => {
  assert.match(losAltosSchoolDistrictWorkflow, /cron: "30 16 \* \* \*"/);
  assert.match(losAltosSchoolDistrictWorkflow, /timeout-minutes: 60/);
  assert.match(losAltosSchoolDistrictWorkflow, /--max-runtime-minutes=45/);
  assert.match(losAltosSchoolDistrictWorkflow, /--require-results-coverage/);
  assert.match(losAltosSchoolDistrictWorkflow, /NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL/);
  assert.match(losAltosSchoolDistrictWorkflow, /SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(losAltosSchoolDistrictWorkflow, /uses: \.\/\.github\/actions\/setup-playwright/);
  assert.match(losAltosSchoolDistrictWorkflow, /date -u \+%u/);
  assert.match(losAltosSchoolDistrictWorkflow, /months_back=3/);
  assert.match(losAltosSchoolDistrictWorkflow, /months_back=1/);
  assert.doesNotMatch(losAltosSchoolDistrictWorkflow, /NEXT_PUBLIC_SANTA_BARBARA_REGION_SUPABASE_URL/);
});
