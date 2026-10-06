**Spanish translation audit — October 5, 2026**

This audit checks what a reader with the Spanish locale (`es`) actually sees: interface text, stored card/meeting/outcome translations, and email. The baseline is `5899f20`. Production access was read-only, and no code or data was changed. The [evidence file](./2026-10-05-spanish-translation-audit-evidence.json) has per-jurisdiction counts and sample record IDs.

**Method**

- Loaded every published card (11,022 across 13 jurisdictions), its meeting, and its decision outcome, plus the matching `es` rows. Each translation was classified the way `lib/db/queries.ts` decides at read time: missing, stale (`source_fingerprint` ≠ the current fingerprint), or current.
- For current card translations, flagged fields that read as English (English function words ≥ 3 and outnumbering Spanish ones 1.5:1, ≥ 6 words). Every flagged sample was read by hand and split into placeholder cards and real translation failures.
- Re-ran `decisionOutcomeTranslationIssues` on every current outcome translation.
- Swept `app/`, `components/`, and `lib/email/` for English strings shown to Spanish readers, and reviewed the Spanish strings in `lib/i18n.ts`.

**Coverage**

| Content | Total | Current `es` | Missing | Stale | Readers see English |
| --- | --- | --- | --- | --- | --- |
| Published cards | 11,022 | 10,576 (96%) | 291 (26 upcoming) | 155 (3 upcoming) | 446 whole cards, plus 1,394 placeholder cards with English titles |
| Meetings with published cards | 1,000 | 997 | 1 | 2 | 59 titles left in English |
| Decision outcomes | 3,065 | 1,579 (52%) | 1,096 | 390 | **1,486 (48%)** |

None of the stale cards went stale from a status change alone (checked by recomputing each fingerprint with every status value), so card staleness comes from real content edits.

**Findings**

1. **Half of decision results are English for Spanish readers (1,486 of 3,065).** It is concentrated in Santa Clara County (404 of 660), San Francisco (418 of 910), Santa Barbara County (361 of 569), and San Mateo County (247 of 417). Outcome translation happens only inline in `upsertDecisionOutcomes` (`lib/db/upsertDecisionOutcomes.ts:528`). It is skipped when the run's LLM budget is exhausted, its failures are only logged, and an outcome is not retried unless a later run changes it. `npm run translations:backfill` would catch up, but no workflow in `.github/workflows/` runs it. Each of the 390 stale rows is a result that was re-extracted, for example by the outcome-matching fix in #38, and never re-translated. All 1,579 current translations pass `decisionOutcomeTranslationIssues`, so quality is fine where a translation exists.
2. **1,394 cards (13%) are placeholder cards whose title stays English.** These are the official-source fallback cards (`lib/llm/agendaItemCoverage.ts:155` `fallbackTranslation`, plus the "La agenda oficial incluye “…”" variant). The explanation is Spanish ("SimpleCity todavía está preparando un resumen detallado…"), but the agenda title, and often the only bullet, is the raw English agenda text. Santa Clara County (659), San Francisco (405), and Santa Barbara County (195) account for 90%. The card is also unsummarized in English, so this is mainly an English summarization gap. For Spanish readers it means a card that is mostly English under a Spanish heading. Translating only the title, through `generateTranslations`, would be cheap.
3. **Status pills break on 5 Foster City cards whose stored translation translated `status`.** Both prompts say to keep `status` in English, but nothing enforces it. `applyCardTranslations` (`lib/db/queries.ts:627`) and the digest (`scripts/send-weekly-digests.ts:190`) then replace `status` with "Votación próxima"/"Cancelada"/"Solo información". `statusSummary` (`components/SummaryCard.tsx:133-180`) compares against English values, so these cards lose their upcoming-vote, cancelled, and info-only pills. Fix: always keep the source `status`; it is translated at display time by `statusLabel`.
4. **Month names are English on Spanish status pills.** `components/SummaryCard.tsx:128` calls `formatCompactDisplayDate` without `locale`, so upcoming cards read "Votación programada Oct 14" or "Reunión Oct 14". This shows on most upcoming cards. The `=== "Date not listed"` check on line 154 relies on the English default, so it needs to change along with the call.
5. **Emails ignore the reader's language.** No locale is stored for subscribers, and `SubscribeForm` doesn't send one.
   - The confirmation email is bilingual with English first (`lib/email/subscriptions.ts:187-229`).
   - The unsubscribe email is English only (`:245`, `:252`).
   - The weekly digest is English-first. Its preheader is English only, and the Spanish subject embeds English area labels ("your area", "N SimpleCity areas") (`lib/email/newPosts.ts:266-300, 395-403`).
   - The shared footer is English only, and the layout always sets `lang="en"` (`lib/email/layout.ts:61, 102`).
6. **14 cards have a real translation failure: the LLM returned English.**
   - Six San Mateo County appointment cards are entirely English.
   - The rest have English `how_to_act_submit_comment` or `comment_window_closes`, for example "4:00 p.m. the day of the meeting".
   - None of these is upcoming.
   - `validateSummary` rejects Spanish that leaks into English cards (`findCardSpanishLeak`), but nothing checks the opposite direction. Outcomes already have this check (`decisionOutcomeTranslationIssues`); cards have none.
7. **291 cards have no Spanish translation at all (26 upcoming), and 155 are stale.** Los Altos (73), Santa Clara County (61), and Los Altos Hills (54, including 10 upcoming) lead. Like outcomes, these depend on the manual backfill.
8. **Interface gaps (medium)**
   - `generateMetadata` reads only `?lang=`, not the locale cookie, so Spanish readers get English page titles after the first click.
   - Static English metadata on `app/following/page.tsx` and `app/offline/page.tsx`.
   - The header's loading fallback renders `t("en", …)` (`components/HeaderNav.tsx:439-500`).
   - `app/error.tsx` shows the raw English error message.
   - Server-specific subscribe errors are replaced with a generic "Algo salió mal".
   - Google Calendar event details are English ("Meeting type:", "Official source:", `lib/utils/calendar.ts:32-33`).
   - Low: a handful of English `aria-label`/sr-only strings (`HeaderNav.tsx:235,310,443,453,470`; `PendingLink.tsx:103,115`; `DecisionMapPanel.tsx:68`), and the PWA manifest.
9. **Wording in `lib/i18n.ts`.** The interface is consistently informal (tú), and no key is accidentally left in English.
   - `all: "Todos"` sits next to the feminine filters "Próximas"/"Pasadas"; it should be "Todas".
   - `Passed: "Aprobada"` conflicts with "Aprobado" in timeline labels (`lib/cardEvents.ts:40-44`), so the same decision shows both genders.
   - `Unknown: "Desconocido"` is masculine, while the meeting statuses beside it are feminine.
   - Anglicisms: "email" and "inbox" should be "correo electrónico" and "bandeja de entrada".
   - "¿Ya estás suscrito?" is gendered.
   - "Parques y ambiente" should be "Parques y medio ambiente".
   - `voteUpcoming` reads better as "Próxima votación".

**Not a problem**

- Number preservation: 171 current cards have a different set of numbers in Spanish. The sampled ones are benign: Spanish adds a date or year, or writes "¼" as words. No sampled card had a changed dollar amount.
- Card/translation alignment: no current translation has a different number of bullets than its English card.
- Outcome translation quality: every stored current outcome translation passes the validator.

**Suggested order**

1. Schedule `translations:backfill` (cards, meetings, outcomes) after the nightly scrapers. This fixes findings 1 and 7, about 1,900 records.
2. Ignore `translation.status` in `applyCardTranslations` and the digest (finding 3), and pass `locale` at `SummaryCard.tsx:128` (finding 4). Both are small changes.
3. Add an English-leak check for `translations.es.cards` in `validateSummary`, mirroring the outcome validator (finding 6).
4. Store the subscriber's locale and render emails in that language (finding 5).
5. Translate the titles of placeholder cards (finding 2), then the interface and wording items.
