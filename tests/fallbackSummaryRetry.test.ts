import assert from "node:assert/strict";
import test from "node:test";
import {
  agendaItemInputHash,
  fallbackSummaryAttempts,
  MAX_FALLBACK_SUMMARY_ATTEMPTS,
  selectAgendaItemsForGeneration,
  withAgendaItemInputHash,
  withFallbackSummaryAttempts
} from "@/lib/llm/agendaItemReuse";
import { completeAgendaItemCoverage } from "@/lib/llm/agendaItemCoverage";
import { isStarvedSummaryError } from "@/lib/pipeline";
import { LlmProcessBudgetExceededError } from "@/lib/llm/provider";
import { officialSourceFallbackExplanation } from "@/lib/utils/summaryFallback";
import { formatAgendaItemContexts, MEETING_WIDE_CONTEXT_HEADING, STRUCTURED_AGENDA_ITEMS_HEADING } from "@/lib/scraper/agendaItemContext";
import type { AgendaItem, LlmReadyMeeting } from "@/lib/types";

function fixture(): LlmReadyMeeting {
  const items: AgendaItem[] = ["1", "2"].map((id) => ({
    externalId: id, fileNumber: null, agendaNumber: id, itemType: null,
    title: `Approve park improvement contract ${id}`, action: null, result: null,
    sourceUrl: `https://example.test/items/${id}`, rowText: `Approve park improvement contract ${id} for $100,000.`
  }));
  return {
    id: "meeting", section: "Upcoming Meetings", title: "City Council", dateText: "September 7, 2026",
    meetingType: "City Council", rowText: "Council", status: "Upcoming", sourceType: "Agenda PDF",
    sourceUrl: "https://example.test/meeting", hasHtmlAgenda: false, hasPdf: true,
    documents: [], items, extractionNotes: [], publicCommentsInputText: null,
    llmInputText: `${STRUCTURED_AGENDA_ITEMS_HEADING}\n${formatAgendaItemContexts(items)}\n${MEETING_WIDE_CONTEXT_HEADING}\nAttend at City Hall.`
  };
}

/** Item 1 has a real summary; item 2 is an official-source fallback card. */
function savedWithFallback(meeting: LlmReadyMeeting, attempts?: number, reason: "validation_failed" | "generation_failed" = "validation_failed") {
  const [real, fallback] = meeting.items!;
  return [
    {
      source_item_id: real.externalId,
      model_input_text: formatAgendaItemContexts([real]),
      why_it_matters: "The contract pays for new playground equipment.",
      raw_llm_json: withAgendaItemInputHash(null, agendaItemInputHash(meeting, real))
    },
    {
      source_item_id: fallback.externalId,
      model_input_text: formatAgendaItemContexts([fallback]),
      why_it_matters: officialSourceFallbackExplanation(reason, "en"),
      raw_llm_json: withFallbackSummaryAttempts(
        withAgendaItemInputHash(null, agendaItemInputHash(meeting, fallback)),
        attempts
      )
    }
  ];
}

test("an unchanged fallback card is selected again while real summaries are retained", () => {
  const meeting = fixture();
  const selection = selectAgendaItemsForGeneration(meeting, savedWithFallback(meeting, 0));
  assert.deepEqual(selection.meeting.items!.map((item) => item.externalId), ["2"]);
  assert.deepEqual(selection.retainedItemIds, ["1"]);
  assert.deepEqual([...selection.fallbackAttempts], [["2", 0]]);
  assert.deepEqual([...selection.inputHashes.keys()], ["2"]);
});

test("fallback cards written before the counter existed count as one attempt and are retried", () => {
  const meeting = fixture();
  for (const reason of ["validation_failed", "generation_failed"] as const) {
    const selection = selectAgendaItemsForGeneration(meeting, savedWithFallback(meeting, undefined, reason));
    assert.deepEqual([...selection.fallbackAttempts], [["2", 1]]);
  }
});

test("a fallback card stops being retried after the attempt limit", () => {
  const meeting = fixture();
  const selection = selectAgendaItemsForGeneration(
    meeting,
    savedWithFallback(meeting, MAX_FALLBACK_SUMMARY_ATTEMPTS)
  );
  assert.equal(selection.meeting.items!.length, 0);
  assert.deepEqual(selection.retainedItemIds, ["1", "2"]);
  assert.equal(selection.fallbackAttempts.size, 0);
});

test("a changed source starts a fresh attempt count", () => {
  const before = fixture();
  const after = structuredClone(before);
  after.items![1].rowText += " Revised contract amount: $200,000.";
  const selection = selectAgendaItemsForGeneration(
    after,
    savedWithFallback(before, MAX_FALLBACK_SUMMARY_ATTEMPTS)
  );
  assert.deepEqual(selection.meeting.items!.map((item) => item.externalId), ["2"]);
  assert.equal(selection.fallbackAttempts.size, 0);
});

test("real summaries are never treated as fallback cards", () => {
  assert.equal(fallbackSummaryAttempts({ why_it_matters: "Residents near the park are affected." }), null);
  assert.equal(fallbackSummaryAttempts({ why_it_matters: null, raw_llm_json: withFallbackSummaryAttempts(null, 0) }), null);
  assert.equal(
    fallbackSummaryAttempts({
      why_it_matters: officialSourceFallbackExplanation("generation_failed", "en"),
      raw_llm_json: withFallbackSummaryAttempts(withAgendaItemInputHash({ a: 1 }, "hash"), 2)
    }),
    2
  );
  assert.deepEqual(withFallbackSummaryAttempts({ a: 1 }, undefined), { a: 1 });
});

test("an item whose own request failed is labelled as not generated, not as unverified", async () => {
  const meeting = fixture();
  const rejectedElsewhere = {
    simplecityValidation: { issues: [{ outcome: "reject", message: "Another card was rejected" }] }
  };
  const initial = {
    summary: { meetingSummary: { title: "City Council", date: "September 7, 2026", status: "Upcoming", oneSentenceSummary: "" }, cards: [] },
    raw: rejectedElsewhere
  };
  const coverage = await completeAgendaItemCoverage(meeting, initial as never, {
    generate: async () => { throw new LlmProcessBudgetExceededError("LLM process budget exhausted before dispatch"); }
  });
  assert.deepEqual(coverage.fallbackItemIds, ["1", "2"]);
  assert.deepEqual(coverage.fallbackReasons, { "1": "generation_failed", "2": "generation_failed" });
  assert.ok(coverage.retryErrors.some((retryError) => isStarvedSummaryError(new Error(retryError))));
});

test("only budget, rate-limit and deadline failures count as a starved run", () => {
  assert.equal(isStarvedSummaryError(new LlmProcessBudgetExceededError("LLM process budget exhausted before dispatch")), true);
  assert.equal(isStarvedSummaryError(new Error("Provider returned 429 rate limit")), true);
  assert.equal(isStarvedSummaryError(new Error("Pipeline deadline reached before this LLM request started.")), true);
  assert.equal(isStarvedSummaryError(new Error("Model returned invalid JSON")), false);
  assert.equal(isStarvedSummaryError(null), false);
});
