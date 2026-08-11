import assert from "node:assert/strict";
import test from "node:test";
import type { LlmReadyMeeting, PrimeGovMeeting } from "@/lib/types";
import {
  agendaIngestionErrors,
  filterResultsCoverageErrors,
  minutesIngestionErrors,
  shouldReconcileMinutesWithoutGeneratingCards,
  shouldSkipUnchangedSummary
} from "@/lib/pipeline";

function meeting(
  documents: PrimeGovMeeting["documents"],
  overrides: Partial<PrimeGovMeeting> = {}
): PrimeGovMeeting {
  return {
    title: "City Council",
    hasHtmlAgenda: false,
    documents,
    ...overrides
  } as PrimeGovMeeting;
}

const usableAgendaText = [
  "Official City Council agenda",
  "1. Approve the annual pavement contract and authorize the city manager to execute it.",
  "2. Hold a public hearing on the downtown housing proposal and receive public comment.",
  "3. Consider adoption of the updated climate action plan and related implementation steps.",
  "Supporting staff reports and participation instructions are included with each listed item.",
  "Residents may review the full supporting record, submit written comments, and attend the meeting.",
  "The council will consider the listed recommendations only after receiving the staff presentation."
].join("\n");

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

test("agenda coverage reports a discovered agenda family with no usable official text", () => {
  assert.deepEqual(
    agendaIngestionErrors([
      meeting([
        {
          type: "Agenda",
          label: "Agenda PDF",
          url: "https://example.com/agenda.pdf",
          downloadError: "Document exceeded the download limit."
        },
        {
          type: "Accessible Agenda",
          label: "Accessible agenda",
          url: "https://example.com/agenda.html",
          extractedText:
            "Access denied. Verify that you are human before continuing to the official agenda."
        }
      ])
    ]),
    [
      "Agenda ingestion incomplete for City Council: 2 published agenda document(s) had no usable official text."
    ]
  );
});

test("agenda coverage accepts a usable alternate official agenda", () => {
  assert.deepEqual(
    agendaIngestionErrors([
      meeting([
        {
          type: "Agenda",
          label: "Agenda PDF",
          url: "https://example.com/agenda.pdf",
          downloadError: "HTTP 500"
        },
        {
          type: "Agenda Packet",
          label: "Agenda packet",
          url: "https://example.com/packet.pdf",
          extractedText: usableAgendaText
        }
      ])
    ]),
    []
  );
});

test("agenda coverage accepts a structured HTML agenda representation", () => {
  assert.deepEqual(
    agendaIngestionErrors([
      meeting(
        [
          {
            type: "HTML Agenda",
            label: "HTML Agenda",
            url: "https://example.com/meeting/agenda"
          }
        ],
        {
          hasHtmlAgenda: true,
          htmlAgendaText: usableAgendaText
        }
      )
    ]),
    []
  );
});

test("agenda coverage accepts structured official agenda items", () => {
  assert.deepEqual(
    agendaIngestionErrors([
      meeting(
        [
          {
            type: "Agenda",
            label: "Agenda PDF",
            url: "https://example.com/agenda.pdf",
            downloadError: "HTTP 500"
          }
        ],
        {
          items: [
            {
              externalId: "item-1",
              fileNumber: null,
              agendaNumber: "1",
              itemType: "Regular Business",
              title: "Approve the annual pavement contract",
              action: null,
              result: null,
              sourceUrl: "https://example.com/meeting/items/1",
              rowText: "1. Approve the annual pavement contract"
            }
          ]
        }
      )
    ]),
    []
  );
});

test("agenda coverage does not require an agenda that was not discovered", () => {
  assert.deepEqual(agendaIngestionErrors([meeting([])]), []);
});

test("challenge, short, and failed minutes cannot bypass card generation", () => {
  const usableMinutes =
    "The City Council approved the annual pavement contract by a unanimous vote of the members.";
  const challengeMinutes =
    "Access denied. Verify that you are human before continuing to the official minutes.";

  assert.equal(
    shouldReconcileMinutesWithoutGeneratingCards(
      meeting([
        {
          type: "Minutes",
          label: "Minutes",
          url: "https://example.com/minutes.pdf",
          extractedText: usableMinutes
        }
      ]) as LlmReadyMeeting,
      2
    ),
    true
  );
  for (const document of [
    {
      type: "Minutes" as const,
      label: "Minutes",
      url: "https://example.com/short-minutes.pdf",
      extractedText: "Approved 5-0."
    },
    {
      type: "Minutes" as const,
      label: "Minutes",
      url: "https://example.com/challenge-minutes.pdf",
      extractedText: challengeMinutes
    },
    {
      type: "Minutes" as const,
      label: "Minutes",
      url: "https://example.com/failed-minutes.pdf",
      extractedText: usableMinutes,
      downloadError: "HTTP 500"
    }
  ]) {
    const record = meeting([document]);
    assert.notDeepEqual(minutesIngestionErrors([record]), []);
    assert.equal(
      shouldReconcileMinutesWithoutGeneratingCards(record as LlmReadyMeeting, 2),
      false
    );
  }
});

test("unchanged source hashes retry structured meetings whose prior summary produced zero cards", () => {
  assert.equal(shouldSkipUnchangedSummary("same-hash", "same-hash"), true);
  assert.equal(shouldSkipUnchangedSummary("same-hash", "same-hash", 0, 2), false);
  assert.equal(shouldSkipUnchangedSummary("same-hash", "same-hash", 0, 0), true);
  assert.equal(shouldSkipUnchangedSummary("new-hash", "old-hash"), false);
  assert.equal(shouldSkipUnchangedSummary(null, null), false);
});

test("results coverage requires the configured summary provider for summarize-and-persist runs", () => {
  const missingProvider =
    "No LLM provider API key is configured; summaries were not generated.";

  assert.deepEqual(
    filterResultsCoverageErrors([missingProvider], {
      persist: true,
      summarize: true
    }),
    [missingProvider]
  );
  assert.deepEqual(
    filterResultsCoverageErrors([missingProvider], {
      persist: false,
      summarize: true
    }),
    []
  );
  assert.deepEqual(
    filterResultsCoverageErrors([missingProvider], {
      persist: true,
      summarize: false
    }),
    []
  );
});

test("results coverage retains existing ingestion and matching gates", () => {
  const coverageErrors = [
    "Agenda ingestion incomplete for City Council.",
    "Summary coverage incomplete for City Council."
  ];
  const unrelatedError = "Could not finalize an old scraper run record.";

  assert.deepEqual(
    filterResultsCoverageErrors([...coverageErrors, unrelatedError], {
      persist: false,
      summarize: false
    }),
    coverageErrors
  );
});
