# Source regeneration audit — September 7, 2026

The audit found a reproducible way to invalidate an agenda summary without changing its generated request text, and substantial reprocessing of existing cards. It does **not** establish that every SF or Santa Clara request was redundant. Earlier advice to treat the failures mainly as a runtime problem was premature.

## Scope and evidence

Read-only inspection covered all **3 SF and 18 Santa Clara “Re-summarizing” events** in the failed runs; current meeting, document and card records for those 21 meetings; 38 SF and 41 Santa Clara scraper-run records since August 1; the August 31 Actions logs; and an older local SF scrape from July 23. No production writes, paid model requests, pipeline reruns, or regeneration-code changes were made during this audit. The earlier packet-download fix remains separate.

- [SF September 7 run](https://github.com/ronemic/simplecity/actions/runs/34149444001)
- [Santa Clara September 7 run](https://github.com/ronemic/simplecity/actions/runs/34142322686)
- [SF August 31 run](https://github.com/ronemic/simplecity/actions/runs/33429362595)
- [Santa Clara August 31 run](https://github.com/ronemic/simplecity/actions/runs/33421426406)

The snapshot reconstruction reproduces today's metadata, LLM-input, document and item fingerprints, and agenda-summary hash, for both SF Board meetings and all 18 Santa Clara meetings. The upcoming SF Public Safety meeting's nested attachment state could not be reconstructed exactly from the compact stored raw data; its metadata, LLM input and meeting-document fingerprints do match.

## Confirmed: the hash can change while the generated summary prompts stay identical

For Santa Clara's **June 15 Behavioral Health Board — Cultural Competency Advisory Committee**, the document inventory contains a motion-detail webpage labeled **“Propose future agenda items.”** Its type is **Agenda**, despite being a motion page with navigation, login/help links, a meeting comment and a sitewide legal notice.

The IQM2 classifier checks whether a link's label contains “agenda” before establishing that it is an agenda document. The summary hash then includes the full extracted text of that page. Structured summary batches, however, use the item contexts and shared participation text; they do not necessarily use every text body included in that hash.

An offline experiment on the reconstructed production meeting appended only a website-navigation notice to this motion page. Results:

- Agenda-summary hash changed: **true**.
- Generated user prompts for both summary batches remained byte-for-byte identical: **true**.
- Number of summary batches: **2**.

This proves a false-invalidation path. It does **not** prove that that particular notice edit caused the September 7 historical hash change; the old document bodies were not retained.

Relevant code: `lib/sources/iqm2.ts:116`, `lib/db/meetingSourceHash.ts:51`, `lib/llm/groq.ts:74`.

## Historical Santa Clara evidence

For that same June 15 meeting, the prior full-source checkpoint recorded on August 24 was `904acc3d42`; September 7 recorded `421692dc90`.

| Component | August 24 | September 7 |
| --- | --- | --- |
| Metadata | e78bb0d206 | e78bb0d206 |
| Assembled LLM input | 578d8f04a3 | 578d8f04a3 |
| Agenda items | 5223de152c | 5223de152c |
| Documents | a99052edfa | 7a2594586b |

Thus the historical change was confined to documents; the recorded input and item evidence were unchanged. August 24 explicitly logged that it kept one existing card and reconciled minutes. September 7 instead generated two summary batches, using **16,727 OpenRouter tokens** in the two primary summary requests, plus repair/verification work. Nine card rows were saved; one surviving row predated the run and eight were newly inserted.

This is evidence of regeneration triggered outside the unchanged agenda-item input. It is **not** evidence that all nine cards were unnecessary: previous coverage was only one card, so some work may have improved coverage. Missing-item recovery should be an explicit decision, separate from a document-hash mismatch.

The **August 27 Planning Commission** meeting also had an unchanged assembled LLM-input fingerprint from its September 1 checkpoint, but changed document and item fingerprints. Ten existing rows were updated and no new rows were inserted. Because item fingerprints include attachment state, unchanged assembled input alone cannot prove the batch prompts were identical. This case remains suspicious, not confirmed redundant.

Across the 18 audited Santa Clara meetings, the current snapshot contains **99 surviving preexisting rows updated today and 120 newly created rows**. These are row-history counts, not an estimate of necessary or wasted requests. Insertion and deletion/replacement behavior means a new row can represent old coverage.

## SF: existing cards were regenerated; source necessity is not fully provable

The expensive meetings were **July 28** and **July 21**, not September meetings. All **238 rows updated across them already existed**: 131 for July 28 and 107 for July 21. July 28 also retained four other preexisting rows. No new card rows were inserted for either meeting.

The August 31 fingerprints match the exact saved checkpoints named by September 7:

| Meeting | Saved checkpoint → current | Metadata | Documents | Assembled input | Items |
| --- | --- | --- | --- | --- | --- |
| July 28 Board | 71c812ad6a → 345d1170fa | unchanged | unchanged | changed | changed |
| July 21 Board | 97e13a632c → 3500643730 | unchanged | unchanged | changed | changed |

The July 28 document fingerprint stayed `5503c0a05a`; July 21 stayed `c1fb1d439c`. Neither agenda documents nor meeting metadata explain these regenerations. The trigger lies in item records / assembled input, or unavailable historical summary-checkpoint state. The relevant hash/parser/prompt code did not change between the August 31 run commit and September 7 run commit.

The logs do not retain previous per-item values, and current database upserts replace them. Therefore this audit cannot identify exactly which of the 238 items changed after August 31, or assign a defensible wasted-request total.

An older July 23 local snapshot provides a limited cross-check for July 21: 79 item IDs match today's inventory. Of those, 76 retain the same title and the other compared agenda-description fields; three titles differ, including approval wording for two appointments and added contract-duration detail. Action/result/row-text fields also changed. That older comparison demonstrates that real item changes and result updates can coexist, but is **not** a substitute for the missing August 31 per-item snapshot.

The September 10 Public Safety and Neighborhood Services Committee meeting reprocessed its one preexisting card as well. Its prior per-item snapshot is unavailable; this audit leaves necessity unclassified.

## Confirmed architectural problem

The initial decision to generate is made at meeting level. Once its hash checks miss, the pipeline passes the whole meeting to the batching summarizer. It does not first compare individual current item inputs against the input version associated with each existing card. Existing rows are matched during persistence, after the LLM work has already happened.

Consequently, even a legitimate change affecting one item can cause unchanged neighboring items to be regenerated. Avoiding duplicate database rows does not avoid duplicate model work. See `lib/pipeline.ts:1081` and `lib/db/upsertMeetings.ts:1331`.

## Recommended next change

1. Classify IQM2 motion pages separately from meeting agendas and keep page navigation/legal boilerplate out of semantic source comparisons.
2. Record and compare source inputs per agenda item. Generate only new, materially changed or explicitly incomplete items, retaining existing unchanged cards.
3. Keep official results/minutes updates separate from agenda-summary regeneration. A changed vote/result should not automatically regenerate the agenda explanation.
4. Save the reason for each generation decision, old/new item fingerprints, and a bounded before/after source diff. Preserve prior input versions so the next audit can quantify necessity instead of inferring it from whole-meeting hashes.

Do not mark all 238 SF items unchanged without those item-level comparisons, and do not indiscriminately suppress retries for missing or incomplete coverage. This audit supports fixing invalidation and generation scope before increasing time/token limits.

## Audited meeting inventory

“Existing updated” counts current surviving rows created before September 7, 00:00 PDT and updated afterward. “New rows” is insertion history only, not proof of new agenda coverage. Component history is matched by meeting-metadata fingerprint; records that do not match the saved checkpoint are explicitly labeled.

| Jurisdiction | Meeting date | Body | Existing updated | New rows | Prior component observation |
| --- | --- | --- | ---: | ---: | --- |
| SF | 9/10/2026 | Public Safety and Neighborhood Services Committee | 1 | 0 | No earlier matching component record |
| SF | 7/28/2026 | Board of Supervisors | 131 | 0 | 2026-08-31: llmInput, items |
| SF | 7/21/2026 | Board of Supervisors | 107 | 0 | 2026-08-31: llmInput, items |
| Santa Clara | Jun 3, 2026 | Race and Health Disparities Community Board - Regular Meeting | 10 | 0 | No earlier matching component record |
| Santa Clara | Jun 11, 2026 | Board of Plumbing Examiners - Regular Meeting | 7 | 2 | No earlier matching component record |
| Santa Clara | Jun 15, 2026 | Behavioral Health Board - Cultural Competency Advisory Committee | 1 | 8 | 2026-08-24: documents |
| Santa Clara | Jun 25, 2026 | Planning Commission - Regular Meeting | 2 | 6 | No earlier matching component record |
| Santa Clara | Jul 8, 2026 | Senior Care Commission - Regular Meeting | 4 | 8 | No earlier matching component record |
| Santa Clara | Jul 9, 2026 | Sustainability Commission - Regular Meeting | 4 | 8 | No earlier matching component record |
| Santa Clara | Jul 22, 2026 | Fairgrounds Management Corporation Board of Directors - Regular Meeting | 10 | 14 | No earlier matching component record |
| Santa Clara | Aug 4, 2026 | Airports Commission - Regular Meeting | 0 | 17 | No earlier matching component record |
| Santa Clara | Aug 5, 2026 | Child Abuse Prevention Council - Allocations Committee Meeting | 4 | 0 | No earlier matching component record |
| Santa Clara | Aug 7, 2026 | Behavioral Health Board - Access, Wellness, and Recovery Committee | 0 | 8 | No earlier matching component record |
| Santa Clara | Aug 10, 2026 | Behavioral Health Board - Executive Committee Special Meeting | 17 | 1 | No earlier matching component record |
| Santa Clara | Aug 10, 2026 | Commission on the Status of Women - Regular Meeting | 0 | 20 | No earlier matching component record |
| Santa Clara | Aug 12, 2026 | Public Safety and Justice Committee - Regular Meeting | 7 | 0 | No earlier matching component record |
| Santa Clara | Aug 17, 2026 | Behavioral Health Board - Cultural Competency Advisory Committee | 0 | 8 | No earlier matching component record |
| Santa Clara | Aug 18, 2026 | Finance and Government Operations Committee - Regular Meeting | 0 | 20 | No earlier matching component record |
| Santa Clara | Aug 20, 2026 | Housing, Land Use, Environment, and Transportation Committee - Regular Meeting | 12 | 0 | 2026-08-21: documents, items (not the saved checkpoint) |
| Santa Clara | Aug 20, 2026 | Veterans Commission of the County of Santa Clara - Regular Meeting | 11 | 0 | 2026-08-22: llmInput, documents, items (not the saved checkpoint) |
| Santa Clara | Aug 27, 2026 | Planning Commission - Regular Meeting | 10 | 0 | 2026-09-01: documents, items |

Machine-readable evidence index: [2026-09-07-source-regeneration-evidence.json](./2026-09-07-source-regeneration-evidence.json).


## Implemented fix and offline verification

The pipeline now selects changed, missing, or unverified substantive agenda items before generation. Both initial generation and coverage recovery use that subset. Persistence enforces the same subset, while pruning uses the full authoritative meeting inventory. Unchanged cards, administrator settings, and their translations remain intact. An empty subset makes no agenda-summary request. Existing full-source and agenda-source fast paths remain available when the item check finds no missing or changed coverage.

Each newly generated card stores a small `_simplecitySourceInputHash` in its existing `raw_llm_json` column, without duplicating the model response. The fingerprint covers the system prompt, item context actually used by generation, meeting metadata, and shared participation instructions. Operational extraction notes, document bytes that do not enter the item prompt, and the Upcoming/Past transition are excluded. Outcomes continue through their existing reconciliation path. No database migration is needed.

Older cards can be reused when their saved `model_input_text` matches exactly and the previous completed meeting snapshot proves shared context has not changed. That snapshot is captured before discovery overwrites it. An unfinished previous run, absent provenance, or ambiguous identity is treated conservatively as unverified. Meetings without structured items retain the existing whole-meeting behavior.

IQM2 discovery now excludes motion and legislative-item detail links from meeting-document discovery before broad agenda-title matching, including the browser-side classifier. Actual item and attachment extraction remains separate.

Offline replay of the saved post-run audit snapshots retained 187 substantive Santa Clara item cards and 238 San Francisco item cards, selecting zero Santa Clara items and one SF item. The selected SF September 10 liquor-license hearing item had one existing card, but its saved item input was 1,245 characters versus 3,780 in the reconstructed current source. The two SF Board of Supervisors meetings selected zero items. These are post-run reuse checks, not a reconstruction of every request made during the earlier failed runs.

Validation: all 690 tests passed, including new regressions for document-only churn, partial changes, missing coverage, shared-context changes, legacy provenance, recovery scope, and persistence boundaries. Targeted ESLint passed. TypeScript passed with the three pre-existing duplicate `.next` generated files excluded. Verification made no model calls and no production writes. The changes are local and have not been deployed.
