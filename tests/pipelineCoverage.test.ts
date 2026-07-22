import assert from "node:assert/strict";
import test from "node:test";
import type { PrimeGovMeeting } from "@/lib/types";
import { minutesIngestionErrors } from "@/lib/pipeline";

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
