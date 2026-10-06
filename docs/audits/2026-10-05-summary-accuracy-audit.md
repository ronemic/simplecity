# Summary accuracy and precision audit

Date: October 5, 2026

Repository baseline: `c908ddc`

Confirmed accuracy problems remain in published cards, including two reproducible parser defects. The highest-priority improvements are source-item boundaries and attribution; prompt changes alone would not address them.

The audit was read-only. No application code, published cards, outcomes, or database records were changed, and no model requests were made. This report was subsequently added at the user's request.

## Scope and method

- Ran the deterministic screening script with `--no-judge` across 13 jurisdictions: **10,283 published past-meeting cards and 3,066 outcomes**.
- Spot-checked the newest published card in each jurisdiction, including available saved model-input text, and investigated selected historical problems. This was a targeted sample, not a statistically representative accuracy assessment.
- Replayed the current agenda parser against saved official-document extracts for the Menlo Park and Los Altos Hills findings below.
- Reproduced conflicting-field item merges and validator gaps with controlled inputs in memory.
- Ran 200 targeted tests covering summary validation, Foster City minutes, agenda-item context, input preparation, decision outcomes, procedural actions, CivicClerk, East Palo Alto, item coverage, and saved input parsing. **All 200 passed.** The reproductions below identify gaps in that coverage.
- Fresh retrieval attempts for selected official pages were unsuccessful. The parser findings rely on saved official-document extracts, not independently verified newer document versions.
- The repository was clean at the end of the read-only audit, before this requested report was created.

## 1. High priority: unrelated agenda content can contaminate a summary

**Published example:** Menlo Park's October 7 [rental-assistance card](https://simplecity.app/cards/11ef39a0-1a99-4b22-923b-b761888f8f48) is assigned to **D1—approval of previous meeting minutes**. Rental assistance is D2.

Replaying the current parser against saved official text reproduces D1 receiving D2's recommendation, other agenda items, and historical minutes as supporting context. The published card's saved model input contains that mixed context.

The parser recognizes ordinary prose containing “subject” and “recommendation” as staff-report structure. In this packet, public-comment prose beginning “subject not listed on the agenda” becomes linked staff-report context. The parsed D2 title is also shortened to “Review and make a” because the title cleaner treats the word “recommendation” as a structural boundary.

Separately, `mergeAgendaItems` combines items by agenda number while retaining the earlier title and potentially another item's longer text and attachments. A controlled reproduction retained “Arbor Day Proclamation” as the title while substituting minutes-approval text and a minutes attachment. This establishes a current unsafe merge behavior; it does not reconstruct the exact historical scrape that produced the published Arbor Day record.

**Action:**

- Require recognizable report headings and bounded sections before extracting staff reports.
- Validate report-to-item identity before attaching supporting context.
- Reject or flag conflicting titles during item merges instead of silently combining their fields.
- Add the actual Menlo Park packet as a regression fixture, checking both item identity and context boundaries.

**Code:** [agendaItemContext.ts](../../lib/scraper/agendaItemContext.ts), particularly `SUBJECT`, `RECOMMENDATION`, `cleanItemTitle`, `staffReportSections`, `bestStaffReport`, and `mergeAgendaItems`.

**Official document referenced by the saved source:** [October 7 Housing Commission agenda packet](https://www.menlopark.gov/files/sharedassets/public/v/1/agendas-and-minutes/housing-commission/2026-meetings/agendas/20261007-housing-commission-agenda-packet.pdf).

## 2. High priority: ordinary numbers become invented agenda items

**Published example:** Los Altos Hills' [“Public hearing on floor and development area” card](https://simplecity.app/cards/667eab5b-b8b0-4db0-838c-7c74ad6e5303), for the October 13 Fast Track/Site Development meeting, uses agenda number **1.098**.

In the saved official document, that number is the **Lot Unit Factor** for the property at 25310 Elena Road. It is followed by a square-footage table. The current parser reproduces a false item numbered `1.098` with that table as its title and context. The published card carries **high confidence**.

**Action:** Recognize item starts from heading and layout evidence rather than whitespace followed by a number. Keep property tables within their parent application. Add a regression asserting that “Lot Unit Factor: 1.098” never creates an agenda item.

**Code:** [agendaItemContext.ts](../../lib/scraper/agendaItemContext.ts), particularly `ITEM_START` and `extractAgendaItemsFromText`.

**Official document referenced by the saved source:** [CivicClerk file 9214](https://losaltoshillsca.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=9214,plainText=false)).

## 3. High priority: corrected code has not corrected some published outcomes

Read-only production queries confirmed that these historical associations remain published:

- Foster City's June 15 [adjournment card](https://simplecity.app/cards/d57a4001-17f4-4a63-8c03-2837d2f88b0c) displays approval of a housing-program cooperation agreement.
- Foster City's June 1 [City Manager employment-agreement card](https://simplecity.app/cards/116cdd25-f248-4091-9b81-1471558b83aa) still cites the neighboring budget motion. Both motions passed unanimously, so checking the vote alone misses the attribution error.

The October 2 parser fixes address the employment-agreement case, but the stored historical outcome still contains its old, truncated source excerpt. The general fallback also continues to build windows extending 900 characters around clusters of outcome terms, which can span neighboring items.

**Action:** Prepare a targeted before/after reconciliation of affected outcomes, verify each against its own minutes section, and then correct stored associations. Track parser versions so fixes can trigger controlled historical review. Do not assume that replaying every historical outcome through the existing fallback will be safe without reviewing changed associations.

**Code:** [extractDecisionOutcome.ts](../../lib/outcomes/extractDecisionOutcome.ts), particularly `guardedResultWindow`.

**Prior evidence:** [October 2 source-backed minutes-parser fixes](2026-10-02-minutes-outcome-fixes.md).

## 4. Medium priority: insufficient source material can produce confident, unhelpful cards

The Los Altos [Arbor Day card](https://simplecity.app/cards/8973dc92-0815-4c92-a757-7d76016017a7) remains published with “Not listed in the source document” as its summary and **high confidence**. Its stored title says “Arbor Day Proclamation,” while its row text and attachment concern approval of April 8 meeting minutes.

A newer Santa Clara County [assessment-appeals card](https://simplecity.app/cards/0f17306a-7d53-4f27-81a8-a9df0ef3230c), for November 3, summarizes a portal's “meeting is not available” message and incorrectly calls the county body “the city.” Its stored input consists of meeting metadata, navigation, and the availability message rather than a substantive agenda.

**Action:**

- Require a substantive item-specific fact before publishing a decision card.
- Detect portal availability messages and treat them as source availability metadata.
- Calculate confidence per item, accounting for source conflicts and missing context, rather than primarily from meeting-level source quality.
- Review existing placeholder cards separately from cards with enough evidence to support a useful summary.

**Code:** [validateSummary.ts](../../lib/llm/validateSummary.ts), particularly `maxConfidenceForMeeting`; [prompts.ts](../../lib/llm/prompts.ts), which currently permits missing-information placeholders.

## 5. Medium priority: validation checks values more effectively than meaning

Controlled reproductions against the current validator produced these results:

| Generated claim | Source | Current result |
| --- | --- | --- |
| The contract costs $100. | The contract costs $1000. | Rejected correctly |
| The count is 200. | The count is 2000. | Accepted |
| The park contract costs $100 and the road contract costs $250. | The park contract costs $250 and the road contract costs $100. | Accepted |
| The contract eliminates park maintenance. | The contract expands park maintenance. | Accepted |

These are demonstrated validation gaps, **not evidence that those synthetic claims were published**. The amount-swap example contains both amounts within the supplied source; simple value presence cannot establish which amount belongs to which contract.

**Action:** Add claim-level checks connecting the subject, action, amount, and qualifier to supporting text. Prioritize negation, monetary relationships, deadlines, and proposed-versus-approved language. Improve bare-number boundaries with source-formatting regressions so joined PDF text does not create false rejections.

**Code:** [validateSummary.ts](../../lib/llm/validateSummary.ts), particularly `isGroundedValue` and the per-card grounding checks.

## 6. Precision improvement: preserve financially important qualifiers

Redwood City's [Veterans Memorial Building card](https://simplecity.app/cards/54285eae-470c-4dd2-9996-10c8ac83f001) accurately preserves amendment amounts and contract ceilings:

- Gilbane: an additional amount up to $189,940, with a total ceiling of $5,526,565.
- ELS: an additional amount up to $29,000, with a total ceiling of $10,157,562.

However, the card omits that **Thompson Builders Corporation will reimburse both amendments**, despite that fact appearing prominently in its saved source. This omission removes useful context about who bears the cost.

**Action:** For spending summaries, explicitly check who pays, reimbursement, funding source, and whether amounts are increases or total ceilings. Preserve these qualifiers when they materially affect a resident's understanding of the proposal.

## Interpreting the screening results

The deterministic screen returned **549 outcome flags and eight placeholder-card flags**. These are investigation leads, not a measured error rate. In particular, a short outcome excerpt may omit a number or other fact that is supported by the full item context.

The screen covered published past-meeting cards; the separate newest-card spot checks also examined upcoming meetings. The sample and targeted reproductions do not establish an overall accuracy percentage, certify every scraper, or measure the completeness of agenda coverage.

## Recommended order of work

1. Correct agenda/report boundaries and prevent numeric table values from creating agenda items.
2. Add source-backed regression fixtures for the reproduced cases and reject conflicting merged item fields.
3. Review and reconcile confirmed incorrect historical outcome associations.
4. Gate publication on substantive item evidence and calibrate confidence per item.
5. Strengthen semantic validation and require material financial qualifiers in summaries.

No recommended corrections were performed as part of this audit.
