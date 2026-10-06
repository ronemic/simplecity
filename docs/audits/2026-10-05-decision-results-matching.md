**Decision results and matching audit — October 5, 2026**

This audit checks how official results are attached to cards (`decision_outcomes`) and how readers find them. It also fixes the matching defects that the audit could reproduce and measure. The baseline is `c908ddc`. Production access was read-only, and this branch writes no data. The [evidence file](./2026-10-05-decision-results-matching-evidence.json) lists every sampled, changed, and verified record by ID.

**Method**

- Rebuilt every stored past meeting the way `scripts/backfill-decision-outcomes.ts` does, ran the extractor, and compared its output with the 3,065 published outcomes across 13 jurisdictions.
- Drew a random sample of 120 published outcomes that the current code still produces: 45 matched by title, 35 by agenda number, and 40 by platform item ID (stratified by jurisdiction). Each was judged against the stored minutes. A subset of the flagged cases was rechecked by hand.
- For the code change, ran the old and new extractors in one process on the same stored data, then checked every removed result against the minutes.

**Sample results**

| Match method | Published | Sample with the wrong motion or wrong headline |
| --- | --- | --- |
| Title | 273 | 29 of 45 |
| Agenda number | 469 | 8 of 35 |
| Platform item ID | 2,270 | 7 of 40 |

Weighted by method and jurisdiction, about 11% of published results show the wrong motion or the wrong outcome. The platform item ID sample is thin for San Francisco, Santa Barbara, and San Mateo County (two to four records each), so treat that figure as approximate.

**Findings fixed on this branch**

1. Text-window fallback. When an item could not be matched by number, structured record, or resolution heading, `guardedResultWindow` searched the minutes for a ~2,000-character window that shared words with the card title. It then took the first vote in that window. That vote usually belonged to the previous item, a procedural motion, or boilerplate. Example: Foster City's April 20 "Warrants of Demands" showed the preceding immigration resolution's vote, while the minutes say "NO ACTION TAKEN." This path is removed. Resolution and minute-order heading matches are kept.
2. Santa Clara County consent copying (34 results). The agenda parser recognizes "Adjournment" as a section heading but not "Adjourn". Items after the consent calendar therefore inherit the "Consent Calendar" type, and the consent vote was copied onto Adjourn, announcements, and letterhead-address cards. The minutes show the chair adjourning without a vote. These minutes give every acted-on item its own "N RESULT:" line, so the calendar motion is no longer copied when such lines are present.
3. Menlo Park page header (10 results). The running header "Planning Commission Regular Meeting Approved Minutes" was read as the vote. One effect: a use permit withdrawn by its applicant (108 Gilbert Ave) showed "Approved". The header is now stripped before a result is read. Menlo Park's "…; passes 6-0" wording is now recognized, but only directly before a tally, because "passes" is also a noun. Without that change, ten correct motions would have been lost: they had only registered because the header's "Approved" sat in the same block.
4. Extend-the-meeting motions (3 results). San Mateo's June 1 budget hearing showed "Passed 5–0" from a motion to extend the meeting, but the minutes say "No formal action was taken on the proposed budget." These motions, including their "ACTION:" label, are now skipped.
5. Recessed meetings (18 results). San Francisco records "MEETING RECESSED | Pass" when a committee stops mid-agenda. These now show "Meeting recessed" (continued) instead of "Committee motion passed".

**Effect of the change on stored data**

| | Results |
| --- | --- |
| Produced by the old code | 3,064 |
| Produced by the new code | 2,815 |
| Removed: text window | 210 |
| Removed: Santa Clara consent copies | 34 |
| Removed: page header | 10 |
| Removed: extend-meeting motion | 3 |
| Changed: recessed meeting | 18 |
| Changed: "Outcome recorded" to the motion's own result (Menlo Park "passes") | 10 |
| Changed: Santa Clara item now uses its own result line | 1 |
| Added: Menlo Park and Los Altos Hills tally-form votes | 8 |

All 210 text-window removals were checked against the minutes. 145 were wrong and 65 were correct. Many of the correct ones are Santa Clara County items approved as a batch, where any nearby vote has identical text. That share (69% wrong) agrees with the random sample (26 of 36 text-window results wrong). The cost of this change is that about 65 true results will no longer be produced for new meetings. All other removals were checked by cause. Five of the ten page-header results match a real approval recorded elsewhere in the minutes. All other non-window removals were wrong. Every change and addition was reviewed.

**Findings not changed here**

- Stored results never shrink. `reconcileDecisionOutcomesForMeeting` only upserts, so 53 published results that the current code no longer produces stayed live. Most are wrong, for example "Public comment → Passed". About seven are correct Menlo Park consent results that the code misses because the PDF splits "ACTION" from ": Motion…". Separately, 51 results the current code would publish have not been written yet.
- Card status contradicts the result panel. 878 past cards show "Vote scheduled <date>" or "Under discussion" next to a recorded decision, because `statusSummary` falls back to the card's stored status. Another 52 show "Passed" although the item was continued, referred, tabled, failed, or withdrawn; most are San Francisco "CONTINUED | Pass" (`lib/utils/officialItemStatus.ts`).
- The result filter and decision search read only the newest 1,000 cards per jurisdiction (`loadLegacyDecisionCardPage` → `loadPublishedCardRowsForJurisdiction`). Results that cannot be reached: Santa Clara County 591 of 660, San Francisco 438 of 910, Menlo Park 89 of 184.
- Wording read as an outcome. "Approve amended delegation" becomes Amended. "continued the discussion" becomes Continued. "ADOPTED (PRELIM.)" becomes Adopted. "Item Nos. 66-68" becomes a "66–68" vote. One Mountain View summary says a heritage-tree appeal was approved when it was denied.
- Agenda-number collisions where minutes number differently from the agenda (Los Altos special items, Menlo Park items taken out of order).
- 1,543 past cards show "Awaiting official result". 517 of them are in meetings whose results were parsed but not matched.

**Production data**

Nothing was written. After this change is deployed, two steps would bring stored data in line:

1. Run `npm run outcomes:backfill -- --execute`. This applies the 29 changes and 8 additions. It also writes results the current code already produces but which have not been stored.
2. Delete the 181 removed results verified wrong (`proposedCleanup.deleteVerifiedWrong` in the evidence file). Keep the 68 verified true (`keepVerifiedTrue`).

Deleting before deployment would let the old pipeline recreate wrong rows for recent meetings.
