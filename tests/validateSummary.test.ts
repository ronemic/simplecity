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
    whatIsHappening: "The council will consider a $100 contract for park maintenance.",
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
          whatIsHappening: "The council will consider a $250 contract for park maintenance."
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
