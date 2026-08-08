import assert from "node:assert/strict";
import test from "node:test";
import type { PrimeGovMeeting } from "@/lib/types";
import {
  hardPipelineIssues,
  minutesIngestionErrors,
  shouldSkipUnchangedSummary
} from "@/lib/pipeline";
import { isSummaryRetryDue, summaryRetryDelayMs } from "@/lib/db/summaryRetryJobs";

function meeting(documents: PrimeGovMeeting["documents"]): PrimeGovMeeting {
  return {
    title: "City Council",
    documents
  } as PrimeGovMeeting;
}

test("minutes coverage accepts every published minutes document with usable text", () => {
  assert.deepEqual(
    minutesIngestionErrors([
      meeting([
        {
          type: "Minutes",
          label: "Minutes",
          url: "https://example.com/minutes.pdf",
          extractedText: "The council approved the item by a unanimous vote of the members."
        }
      ])
    ]),
    []
  );
});

test("minutes coverage accepts a usable official copy when an alternate copy fails", () => {
  assert.deepEqual(
    minutesIngestionErrors([
      meeting([
        {
          type: "Minutes",
          label: "Minutes PDF",
          url: "https://example.com/minutes.pdf",
          downloadError: "HTTP 500"
        },
        {
          type: "Accessible Minutes",
          label: "Accessible Minutes",
          url: "https://example.com/minutes.html",
          extractedText: "The council approved the item by a unanimous vote of the members."
        }
      ])
    ]),
    []
  );
});

test("minutes coverage ignores empty CivicClerk publication placeholders", () => {
  assert.deepEqual(
    minutesIngestionErrors([
      meeting([
        {
          type: "Minutes",
          label: "Minutes",
          url: "https://example.com/empty-minutes.pdf",
          bytes: 0,
          downloadError:
            "Official document endpoint returned an empty unpublished placeholder."
        }
      ])
    ]),
    []
  );
});

test("minutes coverage reports download and extraction failures without double-counting URLs", () => {
  const errors = minutesIngestionErrors([
    meeting([
      {
        type: "Minutes",
        label: "Minutes",
        url: "https://example.com/failed.pdf",
        downloadError: "HTTP 500"
      },
      {
        type: "Accessible Minutes",
        label: "Accessible Minutes",
        url: "https://example.com/failed.pdf",
        downloadError: "HTTP 500"
      },
      {
        type: "Minutes",
        label: "Minutes",
        url: "https://example.com/scanned.pdf",
        localPath: "/tmp/scanned.pdf"
      },
      {
        type: "Agenda",
        label: "Agenda",
        url: "https://example.com/agenda.pdf"
      }
    ])
  ]);

  assert.deepEqual(errors, [
    "Minutes ingestion incomplete for City Council: 1 published minutes document(s) failed to download.",
    "Minutes ingestion incomplete for City Council: 1 published minutes document(s) had no usable extracted text."
  ]);
});

test("unchanged source hashes retry structured meetings whose prior summary produced zero cards", () => {
  assert.equal(shouldSkipUnchangedSummary("same-hash", "same-hash"), true);
  assert.equal(shouldSkipUnchangedSummary("same-hash", "same-hash", 0, 2), false);
  assert.equal(shouldSkipUnchangedSummary("same-hash", "same-hash", 0, 0), true);
  assert.equal(shouldSkipUnchangedSummary("new-hash", "old-hash"), false);
  assert.equal(shouldSkipUnchangedSummary(null, null), false);
});

test("coverage gates typed hard failures but not deferred provider warnings", () => {
  const issues = hardPipelineIssues({
    issues: [
      { code: "summary_deferred", severity: "warning", message: "retry later" },
      { code: "summary_missing", severity: "error", message: "current cards missing" }
    ]
  });
  assert.deepEqual(issues.map((issue) => issue.code), ["summary_missing"]);
});

test("per-meeting summary retries use bounded exponential scheduling", () => {
  const originalBase = process.env.SUMMARY_RETRY_BASE_MS;
  const originalMax = process.env.SUMMARY_RETRY_MAX_MS;
  process.env.SUMMARY_RETRY_BASE_MS = "1000";
  process.env.SUMMARY_RETRY_MAX_MS = "4000";
  try {
    assert.equal(summaryRetryDelayMs(1), 1000);
    assert.equal(summaryRetryDelayMs(3), 4000);
    assert.equal(summaryRetryDelayMs(9), 4000);
    assert.equal(
      isSummaryRetryDue({
        meetingId: "meeting",
        sourceHash: "hash",
        attemptCount: 1,
        nextAttemptAt: "2026-01-01T00:00:00.000Z"
      }, Date.parse("2026-01-01T00:00:01.000Z")),
      true
    );
  } finally {
    if (originalBase === undefined) delete process.env.SUMMARY_RETRY_BASE_MS;
    else process.env.SUMMARY_RETRY_BASE_MS = originalBase;
    if (originalMax === undefined) delete process.env.SUMMARY_RETRY_MAX_MS;
    else process.env.SUMMARY_RETRY_MAX_MS = originalMax;
  }
});
