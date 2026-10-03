**Source-backed minutes-parser fixes — October 2, 2026**

This follow-up to the [accuracy audit](./2026-10-02-summary-scraper-parser-accuracy.md) corrects the reproduced employment-agreement attribution and `No.` truncation defects, together with the classification defect exposed by preserving the complete resolution title. The baseline is `a2b16ee`, which already includes the numeric-grounding fix. Changes are limited to `lib/outcomes/extractDecisionOutcome.ts`, source fixtures, tests, and audit documentation.

No model requests, production database writes, or historical outcome regeneration were performed. The saved official minutes are the evidence for this change. The official portal returned HTTP 403 on a fresh download attempt, so this pass does not claim to have verified a newer version of those documents.

**1. A neighboring motion was assigned to the employment agreement**

- Reproduction: call `extractDecisionOutcome` for Foster City's June 1, 2026 card `116cdd25-f248-4091-9b81-1471558b83aa`, “Adopt amended and restated City Manager employment agreement,” with the saved official minutes. The original parser selects the preceding preliminary-budget motion, Minute Order 2079, instead of City Resolution 2026-057 and EMID Resolution 3852. Both votes are 5–0–0; checking only the vote misses the error.
- Root cause: `guardedResultWindow` matches a title against a window extending 900 characters beyond clusters of outcome terms, then extracts the first motion in that multi-item window. Title evidence and motion evidence can therefore belong to different items.
- Exact change: before using the existing fallback windows, recognize wrapped uppercase item headings containing an explicit resolution or minute-order reference. Match the heading's subject using the existing guarded title matcher, excluding the reference suffix and terminal periods from the identity. Read only the body up to the next uppercase heading, and retain that same bounded text as the evidence supplied to outcome explanations. Reuse the result extracted from that body instead of reparsing its heading. A matched heading with no recognizable result cannot borrow a neighboring motion.
- Verification: the employment agreement now cites 2026-057/3852 and the Jimenez/Niderhofer motion; its context excludes the preliminary budget. The neighboring budget remains associated with 2079, and the two outcomes have distinct item keys. Removing the employment motion yields no outcome. The real May 4 school-crossing agreement no longer borrows the utility-box vote.

**2. A motion stopped at the abbreviation “No.”**

- Reproduction: pass the May 4, 2026 Utility Box Art Pilot Program motion to `extractResultText`. The original output ends at `adopting Minute Order No`, dropping 2074, the expansion into fiscal years 2026–2027 and 2027–2028, Community Benefit Fund funding, and signage instructions.
- Root cause: the `CLEAR_RESULT_PATTERN` sentence fragments disallow every period, including the abbreviation before an official record number.
- Exact change: allow `No.` followed by a number inside those fragments. Ordinary sentence boundaries and existing output-size limits remain in effect.
- Verification: the complete utility-box motion, including funding and signage, is retained. Adding a following sentence about denial of another item does not incorporate that sentence. The original preliminary-budget motion is also preserved through its numbered order reference.

**3. Resolution-title wording changed the outcome classification**

- Reproduction: classify the full June 1 employment-agreement motion or June 15 cooperation-agreement motion. The latter adopts City Resolution 2026-066 to execute a “Second Amendment” for “Continued Participation.” The original classifier reports an amendment instead of the recorded approval. Merely fixing truncation would expose this error in longer excerpts.
- Root cause: `classifyDecisionOutcome` treats amendment/continuance words anywhere in the excerpt as procedural actions, including words inside quoted resolution titles.
- Exact change: exclude quoted titles beginning `A Resolution` from classification only, supporting straight and curly quotation marks and a closing quote omitted by excerpt truncation. The original title remains in the stored source evidence. Action language outside the quoted title is still classified normally.
- Verification: both real motions classify as approved. The cooperation agreement has no continuance next step. Tests retain genuine `as amended`, failed-motion, continued-item, and Legistar amendment classifications outside the quoted title.

**Tests and source replay**

- Added nine tests in [fosterCityMinutes.test.ts](../../tests/fosterCityMinutes.test.ts). Eight fail against the baseline parser; all nine pass with the change. The baseline comparison uses the original module from `a2b16ee`, with import paths adjusted only to load it beside the new fixture tests.
- Run the source regressions with `node --import tsx/esm --test tests/fosterCityMinutes.test.ts`; run nearby coverage with `node --import tsx/esm --test tests/fosterCityMinutes.test.ts tests/decisionOutcomes.test.ts tests/outcomeProceduralActions.test.ts`.
- Replayed 153 inputs: the prior audit's 69 saved published cards across 13 jurisdictions, plus 84 inputs built from the source agenda items in the three fixture meetings. These are not 153 published cards or a random accuracy sample.
- Exactly two of the 69 published-card replays change: the employment-agreement and utility-box cases above. The other 67 are identical, including their evidence and fingerprints.
- Nineteen of the 84 source-item replays change. Twelve gain source-supported results under their own headings. One previously incorrect school-crossing association now returns no result. The remaining six have corrected attribution or longer excerpts; three of those still have pre-existing attribution errors outside this patch's supported heading format, described below. No retained result changes its canonical classification or vote in this replay. Overall results increase from 64 to 75 because 12 are added and one wrong association is removed.
- Every added result was compared with its own section in the fixture. The [replay evidence](./2026-10-02-minutes-outcome-fixes-evidence.json) records changed inputs, before/after outputs, and remaining incorrect associations.
- All 733 repository tests pass, up from the 724-test baseline. `npm run lint` and `npm run build` pass, including TypeScript and static-page generation. The initial sandboxed build could not start a Turbopack worker; rerunning with the required local process permissions succeeded. The build-generated `next-env.d.ts` path change was restored to keep the patch scoped.

**Source fixtures**

Fixtures contain the complete saved official document text. Only trailing line whitespace and the final newline are normalized; whitespace-normalized contents were checked against the saved source snapshots. Original names, spelling, punctuation, line wrapping, and page breaks within the extracted text are retained.

| Fixture | Official source | SHA-256 of fixture |
| --- | --- | --- |
| [May 4 minutes](../../tests/fixtures/foster-city-2026-05-04-minutes.txt) | [Minutes, template 7232](https://fostercity.primegov.com/Public/CompiledDocument?meetingTemplateId=7232&compileOutputType=1) | `1dac52ae9249ede85ad7dac42e3b7e6ef02d46130571a3959f3fd27153642f71` |
| [June 1 minutes](../../tests/fixtures/foster-city-2026-06-01-minutes.txt) | [Minutes, template 7244](https://fostercity.primegov.com/Public/CompiledDocument?meetingTemplateId=7244&compileOutputType=1) | `295f80a1dc193084355903d9b88423da7dbfb027526482a1f9c64c922f49c248` |
| [June 15 minutes](../../tests/fixtures/foster-city-2026-06-15-minutes.txt) | [Minutes, template 7250](https://fostercity.primegov.com/Public/CompiledDocument?meetingTemplateId=7250&compileOutputType=1) | `fbbc4dfb7617da0505c1fed91d7c4aa6ec682d83c60f72a8258e0e2e4af8640a` |

**Limits and findings left unchanged**

- This is a correction for unnumbered items with recognizable resolution/minute-order headings, not a complete replacement for minutes matching. The existing fallback can still misattribute motions to items without those headings. Source-item replay reproduces this for June 1 warrant demands and manager reports, and May 4 manager reports. Their assigned motion was already wrong before the patch; preserving `No.` makes the same wrong motion's excerpt longer. No published records were rewritten. Safely replacing that fallback and reconciling informational/consent sections needs separate source-backed tests.
- The May 4 school-crossing motion omits `carried` and contains no other currently recognized past-tense outcome term. Its actual approval still needs a separate extraction correction; this patch stops attaching the unrelated utility-box approval to it.
- Other abbreviations such as `Inc.`, existing character limits, headings split across blank page boundaries, and multiple motions within one item are not generalized by this change. For example, the June 15 Wildlife Innovations motion still stops at `Inc.`. No general sentence-splitting rewrite was attempted.
- Unproven scraper/input-merge findings, agenda attachment context limits, and bare-number grounding limitations from the earlier audit remain unchanged. The tests and replay support these particular fixes; they do not certify overall summary accuracy.
