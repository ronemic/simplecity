**Summary, scraper, and parser accuracy audit — October 2, 2026**

One narrowly scoped validator fix was implemented: currency amounts, percentages, and explicit quantities must match complete source values. Two additional current minutes-parser defects were reproduced and remain unresolved because a safe correction has not been established. This audit does not certify overall summary accuracy.

The baseline was commit `8c122aa`. All production access was read-only. No model requests, database updates, card regeneration, or data deletion were performed. The [evidence file](./2026-10-02-summary-scraper-parser-accuracy-evidence.json) records counts, sampled card IDs, official URLs, and the reproduced outcome contexts.

**Scope and method**

- Ran the existing deterministic accuracy audit across 13 jurisdictions: 10,233 published past-meeting cards and 2,902 outcomes. Its 496 outcome flags and eight placeholder-card flags are investigation leads, not confirmed error counts. For example, a number absent from a short outcome excerpt can still be supported by the full item context.
- Retrieved 69 published cards, 59 associated meetings, and 1,244 saved item records. The sample comprises four cards ordered by ID per jurisdiction plus selected flagged records. Replayed the original and modified validators against the same saved source data. This is neither a random sample nor a reconstruction of the original model requests.
- Compared selected problems with full saved official-document text. Independently checked Menlo Park's official agenda PDF, current Foster City eSCRIBE HTML, and Santa Barbara's current Legistar API responses.
- Checked exact meeting/source-item identity duplication across 10,943 published cards, including upcoming meetings. Of these, 8,872 had both identities; none shared the same pair. The 2,071 cards without those identities were outside this duplicate check. This does not rule out semantic duplicates, duplicate meetings, or missing records.
- Ran all repository tests, ESLint, and the production build. Live scraper sampling covered two adapters, not every portal.

**Implemented fix: numeric substrings were accepted as evidence**

Reproduction: submit an otherwise valid card to `validateSimpleCitySummary`, with the following generated claim and source value. Every incorrect claim below was accepted by the original validator.

| Generated claim | Source value | Correct behavior |
| --- | --- | --- |
| `$100` | `$1000` | Reject |
| `$100` | `$100.50` | Reject |
| `$100` | `$100 million` | Reject |
| `5 homes` | `15 homes` | Reject |
| `20 percent` | `120 percent` | Reject |
| `$160` agreement ceiling | `$160,000` agreement ceiling | Reject |

The final example uses item I3 on page 2 of [Menlo Park's June 23, 2026 agenda](https://www.menlopark.gov/files/sharedassets/public/v/2/agendas-and-minutes/city-council/2026-meetings/20260623/20260623-city-council-special-and-regular-agenda.pdf). The official agreement with Meredith Roberts has a $160,000 ceiling. The test deliberately changes that value to $160. This demonstrates the validator defect; it does not establish that a published card contained that altered claim.

Root cause: `isGroundedValue` accepted `source.includes(value)` before invoking the existing numeric comparison. A substring of a larger number or scaled amount therefore bypassed comparison of amount, currency/percentage kind, and units.

Exact change in `lib/llm/validateSummary.ts`: run numeric comparison first for currency, percentages, and quantities with recognized units. Preserve the existing PDF digit-spacing comparison. Require complete scale and unit words during extraction so that `m` in `maintenance`, `k` in `known`, and `mi` in `minutes` are not interpreted as unrelated numeric suffixes. Other validation and source-selection rules are retained.

Verification and tests added in `tests/validateSummary.test.ts`:

- Six failure cases were observed against the original implementation, including the official Menlo Park excerpt.
- Eight tests were added: the six reproductions, an incompatible-unit regression guard, and a test covering five valid scale-adjacent phrases.
- Correct `$160,000` and equivalent `$160 thousand` claims remain accepted. Existing tests cover expanded/abbreviated amounts, dates, area and length aliases, item-specific evidence, public-comment exclusion, and PDF address spacing.
- All 56 validator tests pass after the change. Replaying the 69 stored cards produced identical acceptance results before and after: 44 accepted, 25 rejected, no changes. The 25 pre-existing rejections are not a measured historical error rate; current source snapshots and identities may differ from those used during generation.
- The full suite increased from 716 to 724 passing tests. `npm run lint` and `npm run build` passed, including TypeScript and static-page generation. The build-generated `next-env.d.ts` path change was restored to keep the patch scoped.

**Known limitation retained: unqualified numbers and joined source text**

The literal-substring weakness also affects bare numbers: an otherwise valid claim containing `200` can be accepted against `2000`. A broader numeric-comparison change was tested but rejected during source replay: Los Altos Hills card `00fb22ca-3e68-4922-901b-51cc24e34635` says the next meeting is July 27, while its saved source joins that date to the next agenda heading as `July 27.5. Events`. Parsing that string numerically treats `27.5` as a decimal and incorrectly rejects `27`.

Accordingly, the implemented change is limited to currency, percentages, and explicit units. Bare numbers, names, semantic relationships between otherwise matching values, and arbitrary factual claims are not comprehensively verified by this fix. No general source-formatting change was made without a reliable boundary rule.

**Reproduced but not changed: an outcome can cite a neighboring item**

Foster City, June 1, 2026: card `116cdd25-f248-4091-9b81-1471558b83aa`, “Adopt amended and restated City Manager employment agreement,” has outcome `6958723d-dc9d-49f4-949c-fef6a2dc1868`. Replaying `extractDecisionOutcome(card, meeting)` against the saved agenda and [official minutes](https://fostercity.primegov.com/Public/CompiledDocument?meetingTemplateId=7244&compileOutputType=1) reproduces the wrong source motion.

The cited motion belongs to the preceding preliminary-budget hearing, Minute Order 2079. The employment-agreement motion follows its own heading and adopts City Resolution 2026-057 and EMID Resolution 3852. Both motions passed 5–0–0, so the displayed tally alone hides the attribution error.

Root cause: `guardedResultWindow` expands clusters of outcome words by 900 characters on each side. A single candidate can contain several items. Its title similarity can match the employment agreement while `extractResultText` selects the earlier budget motion. The evidence file retains the actual multi-item context and the repeated output.

No code change was made. A safe correction needs reliable item boundaries or an unambiguous motion-to-item relationship across supported minute formats. Simply selecting a later motion, shortening the window, or rejecting every multi-motion window would risk wrong attribution or missing valid outcomes. This issue remains open.

**Reproduced but not changed: outcome excerpts stop at “No.”**

Foster City's May 4, 2026 Utility Box Art Pilot Program outcome `05d4fcda-88b0-4dc2-9e76-17785276e542` ends at `adopting Minute Order No`. The [official minutes](https://fostercity.primegov.com/Public/CompiledDocument?meetingTemplateId=7232&compileOutputType=1) continue with order 2074, program expansion, funding years, and signage instructions. Passing that full motion paragraph to `extractResultText` consistently reproduces the truncation.

Root cause: `CLEAR_RESULT_PATTERN` treats every period as a sentence boundary, including the abbreviation in `No. 2074`.

No code change was made because extending the excerpt changes downstream classification. In another actual Foster City motion, City Resolution 2026-066 approves a second amendment to a cooperation agreement. Feeding the full motion into the current classifier changes `approved` to `amended` merely because the agreement's title contains “Second Amendment.” A punctuation-only fix therefore does not meet the no-regression requirement. Result extraction and classification need a jointly verified correction.

**Other findings left unchanged**

| Finding | Source comparison and disposition |
| --- | --- |
| Eight published cards contain a placeholder instead of a summary | Four are now rejected for unknown source-item IDs; four still validate. The prompt explicitly permits missing-information placeholders, so rejecting them universally would be a behavior-policy change. Some also contain suspicious extracted item identities. The original generation cause was not established, and no records or prompt rules were changed. Card IDs are in the evidence file. |
| Los Altos “Arbor Day proclamation” has mixed source fields | Card `8973dc92-0815-4c92-a757-7d76016017a7` uses an item titled “Arbor Day Proclamation,” but its saved row text and attachment refer to approval of April 8 minutes. The inconsistency is present in the source supplied to the model. The historical scrape/merge transition producing it was not reconstructed, so the scraper was not modified. |
| Historical Foster City housing outcome is attached to an adjournment card | Outcome `0e41ac3a-c04c-4231-b9cb-eb5140881b33` cites the June 15 housing cooperation motion on card `d57a4001-17f4-4a63-8c03-2837d2f88b0c`. The current extractor returns no outcome for that card when replayed with current saved sources. The bad stored association is real, but its creation path was not reproduced. No speculative matcher change or data deletion was made. |
| Short provenance triggers apparent unsupported-number flags | The two sampled San Mateo contract outcomes quote only `Motion passed 5-0`, while their full item contexts carry contract details. The screening script compares numbers with the short excerpt and title, so its aggregate flag rate must not be reported as a hallucination rate. |

**Live scraper checks**

Foster City eSCRIBE returned the October 5 council listing and the October 1 planning meeting. The council listing had no HTML agenda available to the adapter. The planning agenda produced 15 distinct item IDs; all were found in the independently fetched [official HTML](https://pub-fostercity.escribemeetings.com/Meeting.aspx?Id=884dd41e-1c97-438e-8b39-39ce21917de2&Agenda=Agenda&lang=English), whose agenda container remains present. No structural scraper fix was indicated by this sample.

Santa Barbara Legistar was checked for events 2581–2585 and 2587. Dates and times matched the official event responses. The three populated agendas contained 298 raw rows, of which the adapter's existing layout/section rules retained 156. Each retained item's ID, title, agenda number, file number, action, and result matched a fresh official API response exactly. There were no duplicate retained IDs. The other three events had zero item rows in the official API as well. This checks extraction fidelity and current source structure; it does not independently certify every exclusion rule. [Example official event](https://webapi.legistar.com/v1/santabarbara/events/2582).

The source checks support the small validator patch and identify follow-up parser work. They do not justify changing other adapters or automatically rewriting existing published records.
