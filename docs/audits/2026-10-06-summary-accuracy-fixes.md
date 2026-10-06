# Summary accuracy fixes — October 6, 2026

Implements the [October 5 recommendations](2026-10-05-summary-accuracy-audit.md) against repository baseline `8cf44b8`. The newer merged decision-result fix (`b711c0e`) had already removed `guardedResultWindow`; this change preserves that fix.

## Agenda identity and boundaries

- Staff-report extraction requires a recognizable STAFF REPORT heading, a labeled subject (or Menlo Park's Regular Business label), and a recommendation heading. Ordinary prose containing “subject” or “recommendation” is not structure. Known PDF line breaks in those report labels are normalized.
- Reports end at the next report or attachment/preparer heading. Linking requires compatible subject identities and, when present, matching agenda numbers. D1 cannot borrow D2's report.
- Recommendation words inside titles are preserved. Multiline numeric item starts need line-layout evidence; decimal values after property labels are retained as context, including wrapped and flattened extracts.
- Merging different titles at the same agenda number retains the original item's coherent fields, records an extraction error, and prevents the conflicted item from publishing a card.

The two new fixtures contain complete saved official document extracts retrieved from the audited meetings' stored documents. Only trailing line whitespace and the final newline are normalized. They are not fresh downloads of the official portals. Tests replay the actual Menlo Park packet and Los Altos Hills notice, alongside controlled variants.

| Fixture | Official source | SHA-256 |
| --- | --- | --- |
| `tests/fixtures/menlo-park-2026-10-07-agenda.txt` | [Housing Commission packet](https://www.menlopark.gov/files/sharedassets/public/v/1/agendas-and-minutes/housing-commission/2026-meetings/agendas/20261007-housing-commission-agenda-packet.pdf) | `570dbad362700e9e9fc4021d6748f6f9ba69251f322d65b241c5f9968ee23230` |
| `tests/fixtures/los-altos-hills-2026-10-13-agenda.txt` | [CivicClerk file 9214](https://losaltoshillsca.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=9214,plainText=false)) | `52c0fa9764f4bf7f67b3f43dfebb69ac61005905fa7a82df0bfe7c388fbd66d5` |

## Publication and claim validation

- Reject summary-only placeholders, portal availability messages, missing item evidence, and flagged source conflicts. Source selection also excludes availability messages from the row/detail fallback and records an extraction note.
- Confidence is capped per item using the item's own available context, errors, and truncation, in addition to the existing meeting-wide cap. Unstructured or minimal evidence cannot obtain high confidence merely from a long meeting packet.
- Bare numeric values use complete numeric comparisons, retaining support for PDF text that joins numbers and adjacent words. `200` is not grounded by `2000` or `1,200`.
- Conservative clause checks compare subjects before checking monetary relationships, reversed actions, negation, deadlines, and proposed-versus-approved claims. Spending checks preserve explicit reimbursement and payer/funding-source qualifiers and distinguish unambiguous increase/ceiling claims. Repairable failures enter the existing validation repair flow.
- The prompt requires substantive facts, material financial qualifiers, and correct governing-body language, and limits missing-information placeholders to optional metadata/participation fields.

Final review reproduced and fixed two financial-validator false rejections: unrelated historical or neighboring reimbursements no longer apply to the summarized expense, and a funding-source name ends before a following explanatory clause. Regression tests preserve relevant reimbursement checks and require both sources when two funds are explicitly named.

These deterministic checks are not a complete semantic entailment system. They cannot certify arbitrary paraphrases, resolve every ambiguous clause, or infer missing source information. Ambiguous multi-amount increase/ceiling sentences still depend on the prompt and source review. Conservative rejections can require simpler wording in the existing repair pass.

## Reviewed historical outcomes — applied

[The reconciliation evidence](2026-10-06-summary-outcome-reconciliation.json) contains the complete prior outcome rows, replacement fields, bounded source context, and individual verification notes.

- Removed outcome `0e41ac3a-c04c-4231-b9cb-eb5140881b33` from adjournment card `d57a4001-17f4-4a63-8c03-2837d2f88b0c`. The June 15 adjournment section records adjournment at 10:37 p.m. without objection; the housing motion belongs to a separate section, resolution 2026-066. The card itself was retained.
- Updated outcome `6958723d-dc9d-49f4-949c-fef6a2dc1868` for employment-agreement card `116cdd25-f248-4091-9b81-1471558b83aa` using the June 1 employment section: Jimenez/Niderhofer, resolutions 2026-057/3852, 5–0–0. It no longer cites the neighboring budget motion.

Both changes were applied to production and independently read back. PostgreSQL normalized the timestamp and numeric score; the repair verifier compares equivalent timestamps and numeric precision. A read-only rerun reports both records already repaired. Existing outcome-translation fingerprint checks prevent the changed English copy from reusing a stale translation.

`scripts/repair-audited-summary-outcomes.ts` defaults to a read-only check of this fixed, reviewed two-record plan. `--execute` applies only those changes, refuses modified records, uses conditional writes, and verifies read-back. It does not run a broad historical backfill. Original rows remain in the evidence file for recovery. The outcome parser version is exported, included in outcome source fingerprints, and recorded in the plan; changing the version requires a newly reviewed plan.

## Placeholder review

[Separate review evidence](2026-10-06-summary-placeholder-review.json) confirms the Arbor Day card still has a placeholder and conflicting minutes context; it needs corrected source identity before regeneration. The assessment-appeals card describes source unavailability; it needs a substantive official agenda. No replacement facts were invented and neither card was rewritten. The new publication gates prevent these forms from being accepted in future generation. This targeted review does not resolve all eight screening flags or certify every existing card.

## Validation

- All 788 repository tests pass, including source-backed regressions and positive controls for correctly attributed amounts/actions.
- TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), and `git diff --check` pass.
- No model requests, broad outcome regeneration, or application deployment were performed. The parser/validator changes still need the normal application/pipeline deployment; only the two reviewed historical outcome changes were applied directly.
