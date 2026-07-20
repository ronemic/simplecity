import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { AgendaItem, LlmReadyMeeting, SummaryCardRow } from "@/lib/types";
import {
  classifyDecisionOutcome,
  extractDecisionOutcome,
  extractMeetingOutcomeItems,
  extractResultText,
  extractVoteDetail,
  findGuardedAgendaItemMatch,
  interpretOfficialAction,
  outcomeHeadline
} from "@/lib/outcomes/extractDecisionOutcome";
import {
  DECISION_OUTCOME_EXPLANATION_SYSTEM_PROMPT,
  validateDecisionOutcomeExplanation
} from "@/lib/outcomes/generateDecisionOutcomeExplanations";
import {
  keepUniqueOutcomeAssignments,
  reconcileDecisionOutcomesForMeeting,
  resolveCanonicalOutcomeAssignments
} from "@/lib/db/upsertDecisionOutcomes";
import { getDecisionOutcomesNeedingTranslation } from "@/lib/db/upsertDecisionOutcomeTranslations";
import { decisionOutcomeTranslationFingerprint } from "@/lib/db/translationFingerprint";
import {
  applyDecisionOutcomeTranslation,
  decisionOutcomeTranslationIssues,
  withEmbeddedDecisionOutcomeTranslation
} from "@/lib/i18n/decisionOutcome";
import { extractAgendaItemsFromText } from "@/lib/scraper/agendaItemContext";
import { shouldReconcileMinutesWithoutGeneratingCards } from "@/lib/pipeline";

const menloParkMay12Minutes = fs.readFileSync(
  new URL("./fixtures/menlo-park-2026-05-12-minutes.txt", import.meta.url),
  "utf8"
);

function meeting(
  jurisdictionSlug: string,
  overrides: Partial<LlmReadyMeeting> = {}
): LlmReadyMeeting {
  return {
    id: `${jurisdictionSlug}-meeting`,
    externalId: `${jurisdictionSlug}-external`,
    jurisdictionName: jurisdictionSlug,
    jurisdictionSlug,
    platform: jurisdictionSlug === "menlo-park" ? "official-site" : "legistar",
    section: "Past Meetings",
    title: "City Council",
    dateText: "July 14, 2026",
    timeText: "7:00 PM",
    meetingType: "City Council",
    rowText: "July 14, 2026 City Council",
    status: "Past",
    sourceType: "Meeting Details",
    sourceUrl: "https://example.com/meeting",
    meetingDetailsUrl: "https://example.com/meeting",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents: [],
    extractionNotes: [],
    llmInputText: "Agenda source text".repeat(30),
    publicCommentsInputText: null,
    ...overrides
  };
}

function menloParkMay12Meeting() {
  const base = meeting("menlo-park", {
    id: "menlo-park-2026-05-12",
    externalId: "menlo-park-2026-05-12",
    dateText: "May 12, 2026",
    timeText: "6:00 PM",
    sourceUrl: "https://example.com/menlo-park/2026-05-12-agenda.pdf",
    meetingDetailsUrl: "https://example.com/menlo-park/2026-05-12",
    documents: []
  });
  const items = extractAgendaItemsFromText(base, menloParkMay12Minutes);
  return {
    ...base,
    items,
    documents: [
      {
        type: "Minutes" as const,
        label: "Approved minutes",
        url: "https://example.com/menlo-park/2026-05-12-minutes.pdf",
        extractedText: menloParkMay12Minutes
      }
    ]
  };
}

const card: Pick<SummaryCardRow, "id" | "agenda_item" | "source_url"> = {
  id: "card-1",
  agenda_item: "Approve funding for 120 new affordable homes in North Fair Oaks",
  source_url: "https://example.com/item"
};

function agendaItem(overrides: Partial<AgendaItem> = {}): AgendaItem {
  return {
    externalId: "item-1",
    fileNumber: null,
    agendaNumber: null,
    itemType: "Resolution",
    title: "Approve funding for 120 new affordable homes in North Fair Oaks",
    action: "Approved",
    result: "Passed 5-0",
    sourceUrl: "https://example.com/item-1",
    rowText: "Approve funding for 120 new affordable homes in North Fair Oaks. Passed 5-0.",
    ...overrides
  };
}

test("classifies official outcome language and extracts vote details", () => {
  assert.equal(classifyDecisionOutcome("ADOPTED; Result: Pass"), "approved");
  assert.equal(classifyDecisionOutcome("Pass"), "approved");
  assert.equal(outcomeHeadline("approved", "Pass"), "Passed");
  assert.equal(classifyDecisionOutcome("Motion denied by a 3-2 vote"), "rejected");
  assert.equal(classifyDecisionOutcome("Continued to August 4"), "continued");
  assert.equal(classifyDecisionOutcome("Approved as amended"), "amended");
  assert.equal(outcomeHeadline("approved", "Approved unanimously"), "Approved unanimously");
  assert.equal(extractVoteDetail("Motion passed on a 5-0 vote"), "5–0");
  assert.equal(extractVoteDetail("The motion carried unanimously"), "Unanimous");
});

test("interprets Legistar pass flags in the context of their procedural action", () => {
  const committee = meeting("san-francisco", { title: "Budget and Finance Committee" });

  assert.deepEqual(interpretOfficialAction("RECOMMENDED", "Pass", committee), {
    kind: "other",
    canonicalStatus: "recommended",
    headline: "Recommended for approval",
    nextStep: "The item advances to the full Board of Supervisors for further action."
  });
  assert.deepEqual(interpretOfficialAction("HEARD AND FILED", "Pass", committee), {
    kind: "other",
    canonicalStatus: "heard_and_filed",
    headline: "Heard and filed",
    nextStep: null
  });
  assert.deepEqual(interpretOfficialAction("AMENDED, AN AMENDMENT OF THE WHOLE", "Pass", committee), {
    kind: "amended",
    canonicalStatus: "amended",
    headline: "Amended in committee",
    nextStep: "This was a committee action, not final approval by the Board of Supervisors."
  });
  assert.equal(
    interpretOfficialAction("ADOPTED", "Pass", meeting("san-francisco")).headline,
    "Adopted"
  );
});

test("never presents a passed committee recommendation as final approval", () => {
  const result = extractDecisionOutcome(
    card,
    meeting("san-francisco", {
      title: "Budget and Finance Committee",
      items: [agendaItem({ action: "RECOMMENDED", result: "Pass", sourceUrl: card.source_url || "" })]
    })
  );

  assert.ok(result);
  assert.equal(result.kind, "other");
  assert.equal(result.canonicalStatus, "recommended");
  assert.equal(result.headline, "Recommended for approval");
  assert.match(result.summary, /not final approval/i);
});

test("validates LLM explanations against canonical finality and source numbers", () => {
  const input = {
    id: "card-1",
    title: "Lease for 125 Bayshore Boulevard",
    canonicalStatus: "recommended" as const,
    canonicalHeadline: "Recommended for approval",
    fallbackSummary:
      "The committee recommended this item for approval. This was not final approval of the underlying proposal.",
    fallbackNextStep: "The item advances to the full Board of Supervisors for further action.",
    sourceContext: "The committee RECOMMENDED the lease for 125 Bayshore Boulevard. Result: Pass."
  };

  assert.deepEqual(
    validateDecisionOutcomeExplanation(input, {
      canonicalHeadline: "Recommended for approval",
      summary:
        "The committee recommended the lease for approval; this was not final approval of the lease.",
      nextStep: "The item advances to the full Board of Supervisors for further action."
    }),
    {
      summary:
        "The committee recommended the lease for approval; this was not final approval of the lease.",
      nextStep: "The item advances to the full Board of Supervisors for further action."
    }
  );
  assert.equal(
    validateDecisionOutcomeExplanation(input, {
      canonicalHeadline: "Recommended for approval",
      summary: "The committee approved and adopted the lease.",
      nextStep: null
    }),
    null
  );
  assert.equal(
    validateDecisionOutcomeExplanation(input, {
      canonicalHeadline: "Recommended for approval",
      summary: "The committee recommended a $9 million lease for further Board action.",
      nextStep: null
    }),
    null
  );
});

test("requires decision explanations to rewrite minutes boilerplate as plain language", () => {
  const input = {
    id: "card-nealon-park",
    title: "Nealon Park Parking Pilot Project",
    canonicalStatus: "approved" as const,
    canonicalHeadline: "Passed unanimously",
    fallbackSummary:
      "The official minutes record this item as Commission Regular Meeting Minutes March 11, 2026 Page 2 of 2 ACTION: Motion and second (Herscher/Cole), to recommend the conclusion of the Nealon Park Parking Pilot Project, passed unanimously.",
    fallbackNextStep: null,
    sourceContext:
      "Commission Regular Meeting Minutes March 11, 2026 Page 2 of 2 ACTION: Motion and second (Herscher/Cole), to recommend the conclusion of the Nealon Park Parking Pilot Project with the existing back-in angled parking configuration, passed unanimously."
  };

  assert.equal(
    validateDecisionOutcomeExplanation(input, {
      canonicalHeadline: "Passed unanimously",
      summary:
        "Commission Regular Meeting Minutes Page 2 of 2 ACTION: The motion passed unanimously.",
      nextStep: null
    }),
    null
  );
  assert.deepEqual(
    validateDecisionOutcomeExplanation(input, {
      canonicalHeadline: "Passed unanimously",
      summary:
        "The commission unanimously passed a recommendation to conclude the Nealon Park Parking Pilot Project while keeping the existing back-in angled parking configuration.",
      nextStep: null
    }),
    {
      summary:
        "The commission unanimously passed a recommendation to conclude the Nealon Park Parking Pilot Project while keeping the existing back-in angled parking configuration.",
      nextStep: null
    }
  );
  assert.match(DECISION_OUTCOME_EXPLANATION_SYSTEM_PROMPT, /Remove document boilerplate/i);
  assert.match(DECISION_OUTCOME_EXPLANATION_SYSTEM_PROMPT, /Motion and second/i);
});

test("extracts explicit minute actions but ignores recommendation-only text", () => {
  assert.equal(
    extractResultText("ACTION: Councilmember Lee moved to approve the contract. Motion passed 5-0."),
    "Councilmember Lee moved to approve the contract. Motion passed 5-0."
  );
  assert.equal(
    extractResultText("Recommended action: Approve the contract and authorize the city manager."),
    null
  );
  assert.equal(
    extractResultText("Assistant City Clerk. These minutes were approved at the June 9 meeting."),
    null
  );
  assert.match(
    extractResultText("The City Council directed staff to revise the capital plan.") || "",
    /directed staff/i
  );
  assert.equal(extractResultText("No action."), "No action");
  assert.equal(
    outcomeHeadline("other", "The City Council directed staff to revise the plan."),
    "Direction provided"
  );
  assert.equal(outcomeHeadline("other", "No action."), "No action taken");
});

test("keeps a wrapped absence parenthetical in the extracted vote result", () => {
  assert.equal(
    extractResultText(
      "ACTION\n: Motion and second (Taylor/ Combs), to approve the consent calendar, passed 4-0-1 (Wise \nabsent).\n\nG. Study Session"
    ),
    "Motion and second (Taylor/ Combs), to approve the consent calendar, passed 4-0-1 (Wise absent)."
  );
});

test("keeps ordinary PDF line wraps inside an action paragraph", () => {
  assert.equal(
    extractResultText(
      "ACTION: Commissioners voted to approve the item; passed 5-0 with Commissioners Ferrick and\nDoe absent.\n\nH. Informational Items"
    ),
    "Commissioners voted to approve the item; passed 5-0 with Commissioners Ferrick and Doe absent."
  );
});

test("uses a unique official item URL even when the minutes wording changes", () => {
  const match = findGuardedAgendaItemMatch(
    "Fund new affordable housing near Middlefield Road",
    [
      agendaItem({
        title: "Housing loan agreement for the North Fair Oaks development",
        sourceUrl: "https://example.com/official-item"
      })
    ],
    { sourceUrl: "https://example.com/official-item" }
  );

  assert.ok(match);
  assert.equal(match.method, "source_url");
  assert.equal(match.score, 1);
});

test("uses a stable source item id before ambiguous title matching", () => {
  const result = extractDecisionOutcome(
    {
      id: "card-west",
      source_item_id: "library-west",
      agenda_item: "Library renovation contract",
      source_url: "https://example.com/meeting"
    },
    meeting("san-francisco", {
      items: [
        agendaItem({
          externalId: "library-east",
          title: "Approve library renovation contract for East Avenue",
          action: "ADOPTED",
          result: "Pass",
          sourceUrl: "https://example.com/meeting"
        }),
        agendaItem({
          externalId: "library-west",
          title: "Approve library renovation contract for West Avenue",
          action: "ADOPTED",
          result: "Pass",
          sourceUrl: "https://example.com/meeting"
        })
      ]
    })
  );

  assert.ok(result);
  assert.equal(result.matchMethod, "source_item_id");
  assert.equal(result.matchScore, 1);
});

test("does not treat a meeting-level duplicate URL as an item identifier", () => {
  const sharedUrl = "https://example.com/meeting";
  const match = findGuardedAgendaItemMatch(
    "Approve funding for affordable homes in North Fair Oaks",
    [
      agendaItem({ externalId: "housing", sourceUrl: sharedUrl }),
      agendaItem({
        externalId: "parks",
        title: "Authorize playground equipment replacement at Central Park",
        sourceUrl: sharedUrl
      })
    ],
    { sourceUrl: sharedUrl }
  );

  assert.ok(match);
  assert.equal(match.item.externalId, "housing");
  assert.equal(match.method, "title");
});

test("requires a strong fuzzy match with three identity tokens and a clear runner-up margin", () => {
  const clear = findGuardedAgendaItemMatch(
    "Approve funding for affordable homes in North Fair Oaks",
    [
      agendaItem({
        externalId: "housing",
        title: "Affordable homes funding for North Fair Oaks approved"
      }),
      agendaItem({
        externalId: "parks",
        title: "Authorize playground equipment replacement at Central Park"
      })
    ]
  );
  assert.ok(clear);
  assert.equal(clear.item.externalId, "housing");
  assert.ok(clear.score >= 0.72);

  assert.equal(
    findGuardedAgendaItemMatch("Approve contract", [
      agendaItem({ title: "Approve contract for engineering services" })
    ]),
    null
  );
});

test("rejects fuzzy overlap below the 72 percent confidence floor", () => {
  const match = findGuardedAgendaItemMatch(
    "alpha beta gamma delta epsilon zeta eta theta iota kappa",
    [
      agendaItem({
        title: "alpha beta gamma delta epsilon zeta eta lambda mu nu"
      })
    ]
  );
  assert.equal(match, null);
});

test("withholds close fuzzy ties instead of guessing between similar same-meeting items", () => {
  const title = "Award design services contract for central library seismic retrofit";
  const match = findGuardedAgendaItemMatch(title, [
    agendaItem({
      externalId: "library-east",
      title: "Award design services contract for central library seismic retrofit east wing"
    }),
    agendaItem({
      externalId: "library-west",
      title: "Award design services contract for central library seismic retrofit west wing"
    })
  ]);

  assert.equal(match, null);
});

test("rejects conflicting numeric identities during fuzzy matching", () => {
  const match = findGuardedAgendaItemMatch(
    "Approve 120 affordable homes in North Fair Oaks",
    [agendaItem({ title: "Approve 180 affordable homes in North Fair Oaks" })]
  );
  assert.equal(match, null);
});

test("uses an exact agenda number and rejects a conflicting numbered section", () => {
  const exact = findGuardedAgendaItemMatch(
    "Plain-language card title",
    [agendaItem({ agendaNumber: "8", title: "Substantially reworded official item" })],
    { agendaNumber: "8" }
  );
  assert.ok(exact);
  assert.equal(exact.method, "agenda_number");

  assert.equal(
    findGuardedAgendaItemMatch(
      "Approve affordable housing funding",
      [agendaItem({ agendaNumber: "9", title: "Approve affordable housing funding" })],
      { agendaNumber: "8" }
    ),
    null
  );
});

test("enforces one official item assignment per decision card set", () => {
  const unique = keepUniqueOutcomeAssignments([
    { matchedItemKey: "same-item", cardId: "card-1" },
    { matchedItemKey: "same-item", cardId: "card-2" },
    { matchedItemKey: "unique-item", cardId: "card-3" }
  ]);

  assert.deepEqual(unique, [{ matchedItemKey: "unique-item", cardId: "card-3" }]);
});

test("reconciliation withholds both cards when they resolve to the same official item", async () => {
  let outcomeTableTouched = false;
  const supabase = {
    from(table: string) {
      if (table === "decision_outcomes") {
        outcomeTableTouched = true;
        throw new Error("Ambiguous rows must not be persisted");
      }
      assert.equal(table, "summary_cards");
      return {
        select() {
          return {
            async eq() {
              return {
                data: [
                  { ...card, id: "card-1" },
                  { ...card, id: "card-2" }
                ],
                error: null
              };
            }
          };
        }
      };
    }
  };

  const result = await reconcileDecisionOutcomesForMeeting(
    supabase as never,
    "meeting-1",
    meeting("san-francisco", {
      items: [agendaItem({ sourceUrl: card.source_url || "" })]
    })
  );

  assert.equal(outcomeTableTouched, false);
  assert.deepEqual(result, {
    cardsChecked: 2,
    outcomesFound: 2,
    outcomesRejectedAmbiguous: 2,
    resultItemsFound: 1,
    resultItemsMatched: 0,
    resultItemsUnmatched: 1,
    informationalItemsFound: 0,
    duplicateCardsDetected: 1,
    duplicateCardsResolved: 0,
    complete: false,
    outcomesUpserted: 0
  });
});

test("uses structured Legistar results for all supported Legistar jurisdictions", () => {
  for (const jurisdictionSlug of ["san-francisco", "san-mateo-county", "mountain-view"]) {
    const result = extractDecisionOutcome(
      card,
      meeting(jurisdictionSlug, {
        items: [
          {
            externalId: "item-1",
            fileNumber: "240001",
            agendaNumber: "8",
            itemType: "Resolution",
            title: card.agenda_item,
            action: "Approved",
            result: "Pass, 5-0",
            sourceUrl: card.source_url || "",
            rowText: "Approved Pass, 5-0"
          }
        ],
        documents: [
          {
            type: "Minutes",
            label: "Minutes",
            url: `https://example.com/${jurisdictionSlug}/minutes.pdf`
          }
        ]
      })
    );

    assert.ok(result);
    assert.equal(result.kind, "approved");
    assert.equal(result.headline, "Approved");
    assert.equal(result.vote, "5–0");
    assert.equal(result.matchMethod, "source_url");
    assert.equal(result.sourceUrl, `https://example.com/${jurisdictionSlug}/minutes.pdf`);
  }
});

test("supports grounded structured results for every configured jurisdiction", () => {
  for (const jurisdictionSlug of [
    "foster-city",
    "san-mateo-city",
    "san-mateo-county",
    "mountain-view",
    "santa-clara-county",
    "los-altos",
    "san-francisco",
    "menlo-park",
    "east-palo-alto",
    "redwood-city"
  ]) {
    const result = extractDecisionOutcome(
      card,
      meeting(jurisdictionSlug, {
        items: [agendaItem({ action: "Approved", result: "Passed 5-0" })]
      })
    );
    assert.ok(result, jurisdictionSlug);
    assert.equal(result.vote, "5–0", jurisdictionSlug);
  }
});

test("extracts a Menlo Park agenda-item result from official minutes text", () => {
  const result = extractDecisionOutcome(
    card,
    meeting("menlo-park", {
      items: [
        agendaItem({
          agendaNumber: "2",
          action: "Approve the housing loan",
          result: null,
          sourceUrl: card.source_url || ""
        })
      ],
      documents: [
        {
          type: "Minutes",
          label: "Approved minutes",
          url: "https://example.com/menlo-park/minutes.pdf",
          extractedText: `
            1. CALL TO ORDER
            2. North Fair Oaks housing loan agreement
            Staff presented the proposed housing loan.
            ACTION: The City Council approved the loan unanimously.
            3. ADJOURNMENT
          `
        }
      ]
    })
  );

  assert.ok(result);
  assert.equal(result.kind, "approved");
  assert.equal(result.headline, "Approved unanimously");
  assert.equal(result.vote, "Unanimous");
  assert.equal(result.matchMethod, "agenda_number");
  assert.equal(result.sourceUrl, "https://example.com/menlo-park/minutes.pdf");
  assert.match(result.summary, /official minutes/i);
});

test("audits the complete Menlo Park May 12 meeting into ten result-bearing agenda items", () => {
  const inventory = extractMeetingOutcomeItems(menloParkMay12Meeting());
  assert.deepEqual(
    inventory.items.map((item) => item.agendaNumber).sort(),
    ["F1", "F2", "F3", "F4", "F5", "G1", "G2", "H1", "H2", "H3"]
  );
  assert.equal(inventory.agendaItemsFound, 15);
  assert.equal(inventory.informationalItemsFound, 5);

  const headlines = new Map(
    inventory.items.map((item) => {
      const source = String(item.result || "");
      const kind = classifyDecisionOutcome(source);
      return [item.agendaNumber, outcomeHeadline(kind, source)];
    })
  );
  for (const number of ["F1", "F2", "F3", "F4", "F5"]) {
    assert.equal(headlines.get(number), "Passed unanimously");
  }
  assert.equal(headlines.get("G1"), "Direction provided");
  assert.equal(headlines.get("G2"), "Direction provided");
  assert.equal(headlines.get("H1"), "Continued to June 9");
  assert.equal(headlines.get("H2"), "Continued to June 9");
  assert.equal(headlines.get("H3"), "No action taken");
});

test("does not fan a consent vote out to an item recorded as pulled", () => {
  const pulledMinutes = menloParkMay12Minutes.replace(
    "ACTION: Motion and second (Taylor/Wise), to approve the consent calendar, passed unanimously.",
    "Item F3 was pulled for separate consideration.\n\nACTION: Motion and second (Taylor/Wise), to approve the consent calendar, passed unanimously."
  );
  const base = menloParkMay12Meeting();
  const inventory = extractMeetingOutcomeItems({
    ...base,
    items: extractAgendaItemsFromText(base, pulledMinutes),
    documents: [
      {
        type: "Minutes",
        label: "Approved minutes",
        url: "https://example.com/menlo-park/pulled-minutes.pdf",
        extractedText: pulledMinutes
      }
    ]
  });

  assert.equal(
    inventory.items.some((item) => item.agendaNumber === "F3"),
    false
  );
  assert.equal(inventory.items.length, 9);
});

test("reconciles all ten May 12 outcomes to their existing agenda cards", async () => {
  const meetingRecord = menloParkMay12Meeting();
  const agendaTitles = new Map(
    (meetingRecord.items || []).map((item) => [item.agendaNumber, item.title || ""])
  );
  const cardRows = ["F1", "F2", "F3", "F4", "F5", "G1", "G2", "H1", "H2", "H3"].map(
    (agendaNumber, index) => ({
      id: `may12-card-${agendaNumber}`,
      agenda_item: agendaTitles.get(agendaNumber),
      source_url: meetingRecord.sourceUrl,
      created_at: `2026-05-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`
    })
  );
  let persistedRows: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      if (table === "summary_cards") {
        return {
          select() {
            return {
              async eq() {
                return { data: cardRows, error: null };
              }
            };
          }
        };
      }
      assert.equal(table, "decision_outcomes");
      return {
        upsert(rows: Array<Record<string, unknown>>) {
          persistedRows = rows;
          return {
            async select() {
              return {
                data: rows.map((_, index) => ({ id: `outcome-${index}` })),
                error: null
              };
            }
          };
        }
      };
    }
  };

  const result = await reconcileDecisionOutcomesForMeeting(
    supabase as never,
    meetingRecord.id,
    meetingRecord
  );

  assert.equal(result.complete, true);
  assert.equal(result.resultItemsFound, 10);
  assert.equal(result.resultItemsMatched, 10);
  assert.equal(result.resultItemsUnmatched, 0);
  assert.equal(result.outcomesUpserted, 10);
  assert.equal(result.outcomesRejectedAmbiguous, 0);
  assert.equal(persistedRows.length, 10);
  assert.equal(
    new Set(persistedRows.map((row) => row.matched_item_key)).size,
    10
  );
});

test("resolves a clearly later minutes-generated duplicate to the original card", () => {
  const minutesUrl = "https://example.com/minutes.pdf";
  const original = {
    matchedItemKey: "H1",
    cardId: "original",
    cardCreatedAt: "2026-05-01T12:00:00.000Z",
    cardSourceUrl: "https://example.com/agenda.pdf"
  };
  const duplicate = {
    matchedItemKey: "H1",
    cardId: "minutes-duplicate",
    cardCreatedAt: "2026-06-16T12:00:00.000Z",
    cardSourceUrl: minutesUrl
  };
  const resolved = resolveCanonicalOutcomeAssignments(
    [original, duplicate],
    new Set([minutesUrl])
  );

  assert.deepEqual(resolved.selected, [original]);
  assert.equal(resolved.duplicateCardsDetected, 1);
  assert.equal(resolved.duplicateCardsResolved, 1);
  assert.equal(resolved.rejectedAmbiguous, 0);
});

test("late official minutes reconcile outcomes without generating another card set", () => {
  const meetingRecord = menloParkMay12Meeting();
  assert.equal(
    shouldReconcileMinutesWithoutGeneratingCards(meetingRecord, 10),
    true
  );
  assert.equal(
    shouldReconcileMinutesWithoutGeneratingCards(meetingRecord, 0),
    false
  );
  assert.equal(
    shouldReconcileMinutesWithoutGeneratingCards(
      { ...meetingRecord, documents: [] },
      10
    ),
    false
  );
});

test("does not publish a structured result when two same-meeting items are equally plausible", () => {
  const ambiguousCard = {
    ...card,
    source_url: null,
    agenda_item: "Award design services contract for central library seismic retrofit"
  };
  const result = extractDecisionOutcome(
    ambiguousCard,
    meeting("mountain-view", {
      items: [
        agendaItem({
          externalId: "east-wing",
          title: `${ambiguousCard.agenda_item} east wing`,
          sourceUrl: "https://example.com/east-wing"
        }),
        agendaItem({
          externalId: "west-wing",
          title: `${ambiguousCard.agenda_item} west wing`,
          sourceUrl: "https://example.com/west-wing"
        })
      ]
    })
  );

  assert.equal(result, null);
});

test("does not mistake a shared meeting URL for an item-specific result URL", () => {
  const sharedUrl = "https://example.com/shared-meeting";
  const result = extractDecisionOutcome(
    {
      ...card,
      agenda_item: "Authorize playground equipment replacement at Central Park",
      source_url: sharedUrl
    },
    meeting("san-francisco", {
      items: [
        agendaItem({
          externalId: "housing-result",
          sourceUrl: sharedUrl
        }),
        agendaItem({
          externalId: "parks-without-result",
          title: "Authorize playground equipment replacement at Central Park",
          action: "Authorize replacement",
          result: null,
          sourceUrl: sharedUrl
        })
      ]
    })
  );

  assert.equal(result, null);
});

test("does not publish outcomes for unsupported, upcoming, or result-free meetings", () => {
  assert.equal(extractDecisionOutcome(card, meeting("foster-city")), null);
  assert.equal(
    extractDecisionOutcome(card, meeting("san-francisco", { status: "Upcoming" })),
    null
  );
  assert.equal(
    extractDecisionOutcome(
      card,
      meeting("mountain-view", {
        items: [
          {
            externalId: "item-1",
            fileNumber: null,
            agendaNumber: "8",
            itemType: null,
            title: card.agenda_item,
            action: "Approve the loan",
            result: null,
            sourceUrl: card.source_url || "",
            rowText: "Recommended action: approve the loan"
          }
        ]
      })
    ),
    null
  );
  assert.equal(
    extractDecisionOutcome(
      card,
      meeting("san-francisco", {
        items: [agendaItem({ action: null, result: "Action details", sourceUrl: card.source_url || "" })]
      })
    ),
    null
  );
});

test("decision outcome migration enforces one verified outcome per card with public-card RLS", () => {
  const migration = fs.readFileSync(
    new URL("../supabase/migrations/20260718000000_add_decision_outcomes.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /summary_card_id uuid not null unique/);
  assert.match(migration, /kind in \('approved', 'rejected', 'continued', 'amended', 'other'\)/);
  assert.match(migration, /Public can read outcomes for published cards/);
  assert.match(migration, /card\.is_published = true/);
  assert.match(migration, /decision_outcomes_meeting_id_idx/);
  assert.match(migration, /matched_item_key text not null/);
  assert.match(migration, /decision_outcomes_meeting_item_idx/);
  assert.match(migration, /unique index[\s\S]+meeting_id, matched_item_key/);
});

test("decision outcome translations refresh when source copy changes or Spanish is incomplete", async () => {
  const current = {
    id: "outcome-current",
    summary_card_id: "card-current",
    kind: "approved" as const,
    headline: "Passed",
    summary: "The Board passed the ordinance.",
    vote: "Unanimous",
    next_step: null
  };
  const changed = {
    ...current,
    id: "outcome-changed",
    summary_card_id: "card-changed",
    summary: "The Board finally passed the ordinance."
  };
  const partial = {
    ...current,
    id: "outcome-partial",
    summary_card_id: "card-partial"
  };
  const supabase = {
    from(table: string) {
      assert.equal(table, "decision_outcome_translations");
      return {
        select() {
          return {
            eq(_column: string, locale: string) {
              assert.equal(locale, "es");
              return {
                async in() {
                  return {
                    data: [
                      {
                        decision_outcome_id: current.id,
                        headline: "Aprobado",
                        summary: "La Junta aprobó la ordenanza.",
                        vote: "Unánime",
                        next_step: null,
                        source_fingerprint: decisionOutcomeTranslationFingerprint(current)
                      },
                      {
                        decision_outcome_id: changed.id,
                        headline: "Aprobado",
                        summary: "La Junta finalmente aprobó la ordenanza.",
                        vote: "Unánime",
                        next_step: null,
                        source_fingerprint: "stale"
                      },
                      {
                        decision_outcome_id: partial.id,
                        headline: "Aprobado",
                        summary: "La Junta record this item as passed.",
                        vote: "Unánime",
                        next_step: null,
                        source_fingerprint: decisionOutcomeTranslationFingerprint(partial)
                      }
                    ],
                    error: null
                  };
                }
              };
            }
          };
        }
      };
    }
  };

  const candidates = await getDecisionOutcomesNeedingTranslation(
    supabase as never,
    [current, changed, partial],
    "es"
  );
  assert.deepEqual(candidates, [changed, partial]);
});

test("decision outcome translation quality rejects English and partial-English copy", () => {
  const source = {
    headline: "Passed",
    summary:
      "The official minutes record this item as Motion and second (Taylor/Combs), to approve the consent calendar, passed 4-0-1.",
    vote: "4–0–1",
    next_step: null
  };

  assert.deepEqual(
    decisionOutcomeTranslationIssues(source, {
      headline: "Aprobado",
      summary:
        "El acta oficial registra que Taylor y Combs presentaron una moción para aprobar el calendario de consentimiento, que fue aprobada por 4–0–1.",
      vote: "4–0–1",
      next_step: null
    }),
    []
  );
  assert.match(
    decisionOutcomeTranslationIssues(source, {
      headline: "Aprobado",
      summary:
        "El acta oficial registra este punto como Motion and second (Taylor/Combs), to approve the consent calendar, passed 4-0-1.",
      vote: "4–0–1",
      next_step: null
    }).join(" "),
    /summary contains untranslated English/
  );
  assert.match(
    decisionOutcomeTranslationIssues(source, {
      headline: "Passed",
      summary: source.summary,
      vote: "4–0–1",
      next_step: null
    }).join(" "),
    /headline was left in English/
  );
});

test("standardizes the no-action outcome in natural Spanish", () => {
  const outcome = {
    kind: "other" as const,
    headline: "No action taken",
    summary: "The official minutes record this item as No action.",
    vote: null,
    next_step: null
  };
  const translation = {
    headline: "No se tomó acción",
    summary: "El acta oficial registra este punto como No acción.",
    vote: null,
    next_step: null,
    source_fingerprint: decisionOutcomeTranslationFingerprint(outcome)
  };

  assert.deepEqual(applyDecisionOutcomeTranslation(outcome, translation), {
    ...outcome,
    headline: "No se tomó ninguna medida",
    summary: "El acta oficial registra que no se tomó ninguna medida sobre este punto."
  });
});

test("decision outcome freshness falls back to embedded card translation metadata", async () => {
  const outcome = {
    id: "outcome-embedded",
    summary_card_id: "card-embedded",
    kind: "other" as const,
    headline: "No action taken",
    summary: "The official minutes record this item as No action.",
    vote: null,
    next_step: null
  };
  const rawLlmJson = withEmbeddedDecisionOutcomeTranslation({}, {
    headline: "No se tomó ninguna medida",
    summary: "Las actas oficiales registran que no se tomó ninguna medida sobre este tema.",
    vote: null,
    next_step: null,
    source_fingerprint: decisionOutcomeTranslationFingerprint(outcome)
  });
  const supabase = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                async in() {
                  if (table === "decision_outcome_translations") {
                    return {
                      data: null,
                      error: {
                        code: "PGRST205",
                        message: "Could not find decision_outcome_translations"
                      }
                    };
                  }
                  assert.equal(table, "summary_card_translations");
                  return {
                    data: [{
                      summary_card_id: outcome.summary_card_id,
                      source_fingerprint: "card-fingerprint",
                      raw_llm_json: rawLlmJson
                    }],
                    error: null
                  };
                }
              };
            }
          };
        }
      };
    }
  };

  assert.deepEqual(
    await getDecisionOutcomesNeedingTranslation(supabase as never, [outcome], "es"),
    []
  );
});

test("Spanish decision outcome copy replaces English only while its fingerprint is current", () => {
  const outcome = {
    id: "outcome-1",
    kind: "approved" as const,
    headline: "Passed",
    summary: "The Board passed the ordinance.",
    vote: "Unanimous",
    next_step: "The ordinance takes effect in 30 days."
  };
  const spanish = {
    headline: "Aprobada",
    summary: "La Junta aprobó la ordenanza.",
    vote: "Unánime",
    next_step: "La ordenanza entra en vigor en 30 días.",
    source_fingerprint: decisionOutcomeTranslationFingerprint(outcome)
  };

  assert.deepEqual(applyDecisionOutcomeTranslation(outcome, spanish), {
    ...outcome,
    headline: spanish.headline,
    summary: spanish.summary,
    vote: spanish.vote,
    next_step: spanish.next_step
  });
  assert.equal(
    applyDecisionOutcomeTranslation(
      { ...outcome, summary: "The Board finally passed the ordinance." },
      spanish
    ).summary,
    "The Board finally passed the ordinance."
  );
});

test("decision outcome translation migration uses fingerprinted locale rows and published-card RLS", () => {
  const migration = fs.readFileSync(
    new URL(
      "../supabase/migrations/20260720000000_add_decision_outcome_translations.sql",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(migration, /decision_outcome_id uuid not null references public\.decision_outcomes/);
  assert.match(migration, /source_fingerprint text not null/);
  assert.match(migration, /vote text/);
  assert.match(migration, /unique \(decision_outcome_id, locale\)/);
  assert.match(migration, /Public can read published outcome translations/);
  assert.match(migration, /card\.is_published = true/);
  for (const filename of ["bootstrap_full.sql", "bootstrap_county.sql"]) {
    const bootstrap = fs.readFileSync(new URL(`../supabase/${filename}`, import.meta.url), "utf8");
    assert.match(bootstrap, /create table if not exists public\.decision_outcome_translations/);
  }
});

test("official card queries and pipeline runs attach verified outcomes outside the preview route", () => {
  const queries = fs.readFileSync(new URL("../lib/db/queries.ts", import.meta.url), "utf8");
  const pipeline = fs.readFileSync(new URL("../lib/pipeline.ts", import.meta.url), "utf8");
  const translator = fs.readFileSync(new URL("../lib/llm/translate.ts", import.meta.url), "utf8");
  const summaryCard = fs.readFileSync(
    new URL("../components/SummaryCard.tsx", import.meta.url),
    "utf8"
  );

  assert.match(queries, /\.from\("decision_outcomes"\)/);
  assert.match(queries, /\.from\("decision_outcome_translations"\)/);
  assert.match(queries, /applyDecisionOutcomeTranslation\(outcome, translation\)/);
  assert.match(queries, /outcome: outcomes\.get\(row\.id\) \|\| null/);
  assert.match(pipeline, /translateWithLlm: true/);
  assert.match(translator, /Translate every non-null public field in outcomes\[\]/);
  assert.match(summaryCard, /outcome = card\.outcome/);
  assert.match(summaryCard, /<DecisionOutcomePanel/);
});
