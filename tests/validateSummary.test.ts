import assert from "node:assert/strict";
import test from "node:test";
import { validateSimpleCitySummary } from "@/lib/llm/validateSummary";

const baseSummary = {
  meetingSummary: {
    title: "Council Meeting",
    date: "June 13, 2026",
    status: "Upcoming",
    oneSentenceSummary: "A regular meeting."
  }
};

function groundedCard(overrides: Record<string, unknown> = {}) {
  return {
    agendaItem: "Item 4 - Contract approval",
    whatIsHappening: ["The council will consider a $100 contract for park maintenance."],
    whyItMatters: "The contract affects park maintenance work.",
    whoItAffects: ["park users"],
    categoryTags: ["Parks & Environment"],
    status: "Upcoming vote",
    commentWindow: {
      opens: "Not listed in the source document.",
      closes: "Not listed in the source document."
    },
    howToAct: {
      attend: "Attend the meeting at 7:00 PM.",
      email: "Not listed in the source document.",
      submitComment: "Not listed in the source document."
    },
    source: "https://city.example/agendas/4",
    confidence: "high",
    ...overrides
  };
}

test("drops cards with exact values that are not grounded in the source text", () => {
  const issues: Array<{ reason: string; value?: string }> = [];
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [
        groundedCard({
          whatIsHappening: ["The council will consider a $250 contract for park maintenance."]
        })
      ]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText: "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM.",
      onIssue: (issue) => issues.push(issue)
    }
  );

  assert.equal(result.cards.length, 0);
  assert.match(issues[0]?.reason || "", /exact values/);
  assert.equal(issues[0]?.value, "$250");
});

test("drops cards containing leaked JSON braces or degenerate repeated text", () => {
  for (const agendaItem of [
    "Approve minutes from April 8, {{{{{{{{{{{{",
    "Approve minutes approve minutes approve minutes approve minutes approve minutes approve minutes"
  ]) {
    const issues: Array<{ reason: string }> = [];
    const result = validateSimpleCitySummary(
      {
        ...baseSummary,
        cards: [groundedCard({ agendaItem })]
      },
      {
        fallbackSource: "https://city.example/agendas/4",
        allowedSourceUrls: ["https://city.example/agendas/4"],
        sourceText:
          "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM.",
        onIssue: (issue) => issues.push(issue)
      }
    );

    assert.equal(result.cards.length, 0);
    assert.match(issues[0]?.reason || "", /malformed generated text/i);
  }
});

test("drops only a corrupted translation and reports a validation issue", () => {
  const issues: Array<{ reason: string }> = [];
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [groundedCard()],
      translations: {
        es: {
          cards: [
            {
              agendaItem: "Aprobar contrato {{{{{{{{{{{{",
              whatIsHappening: ["El concejo considerará un contrato para mantenimiento."],
              whyItMatters: "El contrato afecta el mantenimiento del parque.",
              whoItAffects: ["usuarios del parque"],
              status: "Upcoming vote"
            }
          ]
        }
      }
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText:
        "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM for park maintenance.",
      onIssue: (issue) => issues.push(issue)
    }
  );

  assert.equal(result.cards.length, 1);
  assert.equal(result.translations?.es?.cards[0], null);
  assert.match(issues[0]?.reason || "", /translated agenda item/i);
});

test("accepts equivalent abbreviated and expanded numeric values", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [
        groundedCard({
          whatIsHappening: ["The council will consider a 200 million bond for park improvements."]
        })
      ]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText:
        "Item 4 - Bond approval. The council will consider a 200,000,000 bond at 7:00 PM."
    }
  );

  assert.equal(result.cards.length, 1);
});

for (const scenario of [
  {
    name: "decimal billions",
    summaryValue: "$0.2 billion",
    sourceValue: "$200,000,000"
  },
  {
    name: "short currency suffixes",
    summaryValue: "$200M",
    sourceValue: "$200,000,000"
  },
  {
    name: "percentage words and symbols",
    summaryValue: "20 percent",
    sourceValue: "20%"
  },
  {
    name: "compatible length aliases",
    summaryValue: "200 ft",
    sourceValue: "200 feet"
  },
  {
    name: "thousand suffixes",
    summaryValue: "200 thousand homes",
    sourceValue: "200,000 homes"
  }
]) {
  test(`accepts equivalent numeric values using ${scenario.name}`, () => {
    const result = validateSimpleCitySummary(
      {
        ...baseSummary,
        cards: [
          groundedCard({
            whatIsHappening: [`The proposal includes ${scenario.summaryValue}.`]
          })
        ]
      },
      {
        fallbackSource: "https://city.example/agendas/4",
        allowedSourceUrls: ["https://city.example/agendas/4"],
        sourceText: `Item 4. The proposal includes ${scenario.sourceValue} at 7:00 PM.`
      }
    );

    assert.equal(result.cards.length, 1);
  });
}

test("does not ground equivalent numbers across incompatible units", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [
        groundedCard({
          whatIsHappening: ["The project would build 200 million homes."]
        })
      ]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText: "Item 4. The project would use 200,000,000 units at 7:00 PM."
    }
  );

  assert.equal(result.cards.length, 0);
});

test("does not ground a currency amount from a plain number", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [
        groundedCard({
          whatIsHappening: ["The proposal would cost $200 million."]
        })
      ]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText: "Item 4. The proposal includes 200,000,000 units at 7:00 PM."
    }
  );

  assert.equal(result.cards.length, 0);
});

test("falls back to the official source URL and caps confidence", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [
        groundedCard({
          source: "https://unofficial.example/card",
          confidence: "high"
        })
      ]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText: "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM.",
      maxConfidence: "medium"
    }
  );

  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].source, "https://city.example/agendas/4");
  assert.equal(result.cards[0].confidence, "medium");
});

test("dedupes cards for the same agenda item and source", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [groundedCard(), groundedCard()]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText: "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM."
    }
  );

  assert.equal(result.cards.length, 1);
});

test("keeps Spanish card translations aligned with validated cards", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [groundedCard()],
      translations: {
        es: {
          meeting: {
            title: "Reunión del Concejo",
            meetingType: "Concejo Municipal"
          },
          cards: [
            {
              agendaItem: "Aprobación de contrato",
              whatIsHappening: [
                "El concejo considerará un contrato de $100 para mantenimiento de parques."
              ],
              whyItMatters: "El contrato afecta el mantenimiento de parques.",
              whoItAffects: ["usuarios de parques"],
              status: "Votación próxima",
              commentWindow: {
                opens: "No indicado en el documento fuente.",
                closes: "No indicado en el documento fuente."
              },
              howToAct: {
                attend: "Asiste a la reunión a las 7:00 PM.",
                email: "No indicado en el documento fuente.",
                submitComment: "No indicado en el documento fuente."
              }
            }
          ]
        }
      }
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText: "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM."
    }
  );

  assert.equal(result.cards.length, 1);
  assert.equal(result.translations?.es?.meeting?.title, "Reunión del Concejo");
  assert.equal(result.translations?.es?.cards.length, 1);
  assert.equal(result.translations?.es?.cards[0]?.agendaItem, "Aprobación de contrato");
  assert.equal(result.translations?.es?.cards[0]?.status, "Upcoming vote");
});

test("preserves structured point boundaries around punctuation-heavy civic text", () => {
  const points = [
    "The hearing concerns Smith v. City of Los Altos on Jan. 15 at 6:30 p.m.",
    "Staff called the U.S. Dept. report “complete.” Council review is still required."
  ];
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [groundedCard({ whatIsHappening: points })]
    },
    { fallbackSource: "https://city.example/agendas/4" }
  );

  assert.deepEqual(result.cards[0].whatIsHappening, points);
});

test("rejects legacy summary strings and arrays longer than three points", () => {
  assert.throws(() =>
    validateSimpleCitySummary({
      ...baseSummary,
      cards: [groundedCard({ whatIsHappening: "One combined summary string." })]
    })
  );

  assert.throws(() =>
    validateSimpleCitySummary({
      ...baseSummary,
      cards: [groundedCard({ whatIsHappening: ["One.", "Two.", "Three.", "Four."] })]
    })
  );
});

test("drops cards with duplicate structured points", () => {
  const issues: Array<{ reason: string }> = [];
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [groundedCard({ whatIsHappening: ["Same point.", "same point."] })]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      onIssue: (issue) => issues.push(issue)
    }
  );

  assert.equal(result.cards.length, 0);
  assert.match(issues[0].reason, /duplicate what-is-happening points/);
});

test("drops a Spanish translation when its point count does not match English", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [groundedCard({ whatIsHappening: ["One.", "Two."] })],
      translations: {
        es: {
          cards: [
            {
              agendaItem: "Aprobación de contrato",
              whatIsHappening: ["Uno."],
              whyItMatters: "El contrato afecta el mantenimiento de parques.",
              whoItAffects: ["usuarios de parques"],
              status: "Upcoming vote",
              commentWindow: {
                opens: "No indicado en el documento fuente.",
                closes: "No indicado en el documento fuente."
              },
              howToAct: {
                attend: "Asista.",
                email: "No indicado en el documento fuente.",
                submitComment: "No indicado en el documento fuente."
              }
            }
          ]
        }
      }
    },
    { fallbackSource: "https://city.example/agendas/4" }
  );

  assert.deepEqual(result.cards[0].whatIsHappening, ["One.", "Two."]);
  assert.equal(result.translations?.es?.cards[0], null);
});

test("drops cards with ungrounded contact details", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [
        groundedCard({
          howToAct: {
            attend: "Attend the meeting at 7:00 PM.",
            email: "Email comments to clerk@example.com.",
            submitComment: "Not listed in the source document."
          }
        })
      ]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText: "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM."
    }
  );

  assert.equal(result.cards.length, 0);
});

test("drops historical outcome statuses from upcoming meeting cards", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [groundedCard({ status: "Passed" })]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText: "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM.",
      meetingStatus: "Upcoming"
    }
  );

  assert.equal(result.cards.length, 0);
});

test("accepts routine approval as a current procedural status", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [
        groundedCard({
          agendaItem: "Approve meeting minutes",
          whatIsHappening: ["The council will approve its meeting minutes."],
          whyItMatters: "The minutes provide the official record of the meeting.",
          categoryTags: ["City Services"],
          status: "Routine approval",
          confidence: "medium"
        })
      ]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText: "Approve meeting minutes. The council will approve its meeting minutes. The minutes provide the official record of the meeting. Attend at 7:00 PM.",
      meetingStatus: "Upcoming"
    }
  );

  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].status, "Routine approval");
});

test("keeps at most two unique supported topics in model order", () => {
  const result = validateSimpleCitySummary(
    {
      ...baseSummary,
      cards: [
        groundedCard({
          categoryTags: [
            "Transportation",
            "Transportation",
            "City Services",
            "Public Safety"
          ]
        })
      ]
    },
    {
      fallbackSource: "https://city.example/agendas/4",
      allowedSourceUrls: ["https://city.example/agendas/4"],
      sourceText: "Item 4 - Contract approval. The council will consider a $100 contract at 7:00 PM."
    }
  );

  assert.deepEqual(result.cards[0].categoryTags, ["Transportation", "City Services"]);
});
