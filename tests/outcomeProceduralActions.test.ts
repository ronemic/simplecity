import assert from "node:assert/strict";
import test from "node:test";
import {
  extractVoteDetail,
  interpretOfficialAction
} from "@/lib/outcomes/extractDecisionOutcome";
import { validateDecisionOutcomeExplanation } from "@/lib/outcomes/generateDecisionOutcomeExplanations";
import { hasPublishableCardContent } from "@/lib/utils/cardContent";

const council = {
  jurisdictionSlug: "santa-barbara-county",
  title: "Board of Supervisors Regular Meeting",
  meetingType: "Regular Meeting"
};

test("an item withdrawn from the agenda is not reported as approved", () => {
  // Real shape from santa-barbara-county: the platform still stamps "Pass".
  const outcome = interpretOfficialAction("Withdrawn from the agenda", "Pass", council);
  assert.equal(outcome.canonicalStatus, "withdrawn");
  assert.notEqual(outcome.kind, "approved");
  assert.equal(outcome.headline, "Withdrawn from the agenda");
});

test("withdrawal wording that is the subject of the item stays an approval", () => {
  const funds = interpretOfficialAction(
    "Approve the withdrawal of $2,000,000 from the Capital Reserve Fund",
    "Pass",
    council
  );
  assert.equal(funds.kind, "approved");

  const membership = interpretOfficialAction(
    "Authorize withdrawal from the regional joint powers authority",
    "Pass",
    council
  );
  assert.equal(membership.kind, "approved");
});

test("a motion to rescind an earlier vote is not reported as approved", () => {
  // Real shape from san-francisco outcome 2cd355d8.
  const outcome = interpretOfficialAction(
    "Chair Chan, seconded by Vice Chair Dorsey moved to RESCIND the previous vote",
    "Pass",
    { jurisdictionSlug: "san-francisco", title: "Board of Supervisors", meetingType: "Regular" }
  );
  assert.equal(outcome.canonicalStatus, "rescinded");
  assert.notEqual(outcome.kind, "approved");
});

test("adopting an ordinance that rescinds a resolution remains an approval", () => {
  const outcome = interpretOfficialAction(
    "Adopt an ordinance rescinding Resolution No. 41-22 concerning parking fees",
    "Pass",
    council
  );
  assert.equal(outcome.kind, "approved");
});

test("a motion to reconsider is not reported as approved", () => {
  const outcome = interpretOfficialAction(
    "Councilmember Lee moved to reconsider the vote on Item 12",
    "Pass",
    council
  );
  assert.equal(outcome.canonicalStatus, "reconsidered");
  assert.notEqual(outcome.kind, "approved");
});

test("a roll call stops before the next tally label and the next motion", () => {
  // Real shape from san-francisco: no periods, so the old pattern ran on.
  const vote = extractVoteDetail(
    "motion carried by the following vote: Ayes: 3 - Chan, Dorsey, Chen Excused: 3 - Sauter, Walton, Mandelman Chair Chan, seconded by Vice Chair Dorsey moved to RESCIND the previous vote"
  );
  assert.equal(vote, "Ayes: 3 - Chan, Dorsey, Chen; Noes: None");
  assert.ok(!/rescind/i.test(String(vote)));
  assert.ok(!/seconded/i.test(String(vote)));
});

test("a roll call stops before document labels glued onto the tally", () => {
  // Real shapes from san-mateo-county and santa-clara-county minutes.
  assert.equal(
    extractVoteDetail(
      "Ayes: Speier, Corzo, Mueller, Gauthier, and Canepa5 - No: 0 Enactment No: Resolution-081627 CLOSED SESSION 53"
    ),
    "Ayes: Speier, Corzo, Mueller, Gauthier, and Canepa5; Noes: 0"
  );
  assert.equal(
    extractVoteDetail("Ayes: Astrawinata, Ayala, Taylor ABSENT: Brammer, Kitchiner"),
    "Ayes: Astrawinata, Ayala, Taylor; Noes: None"
  );
});

test("a plain roll call with ayes and noes is still captured in full", () => {
  assert.equal(
    extractVoteDetail("AYES: Arenas, Duong, Lee, Ellenberg, Abe-Koga. NOES: Simitian."),
    "Ayes: Arenas, Duong, Lee, Ellenberg, Abe-Koga; Noes: Simitian"
  );
  assert.equal(extractVoteDetail("Motion passed on a 5-0 vote"), "5–0");
  assert.equal(extractVoteDetail("The motion carried unanimously"), "Unanimous");
});

test("a withdrawn outcome may not be explained as having passed", () => {
  const input = {
    id: "1",
    title: "Good Samaritan Shelter Life House II funding",
    canonicalStatus: "withdrawn" as const,
    canonicalHeadline: "Withdrawn from the agenda",
    fallbackSummary: "The item was withdrawn from the agenda.",
    fallbackNextStep: null,
    sourceContext: "Withdrawn from the agenda | Pass"
  };
  assert.equal(
    validateDecisionOutcomeExplanation(input, {
      canonicalHeadline: "Withdrawn from the agenda",
      summary: "The item “Withdrawn: Good Samaritan Shelter Life House II funding” passed."
    }),
    null
  );
  assert.ok(
    validateDecisionOutcomeExplanation(input, {
      canonicalHeadline: "Withdrawn from the agenda",
      summary: "The Board withdrew this funding item from the agenda without acting on it."
    })
  );
});

test("a card whose body is only the source placeholder is not publishable", () => {
  assert.equal(
    hasPublishableCardContent({
      whatIsHappening: "Not listed in the source document.",
      whyItMatters: "Not listed in the source document."
    }),
    false
  );
  assert.equal(
    hasPublishableCardContent({ whatIsHappening: [], whyItMatters: "" }),
    false
  );
  assert.equal(
    hasPublishableCardContent({
      whatIsHappening: ["The Council will vote on a $50,000 HVAC contract."],
      whyItMatters: "Not listed in the source document."
    }),
    true
  );
  assert.equal(
    hasPublishableCardContent({
      whatIsHappening: "Not listed in the source document.",
      whyItMatters: "Repairs keep public buildings cool during heat waves."
    }),
    true
  );
});
