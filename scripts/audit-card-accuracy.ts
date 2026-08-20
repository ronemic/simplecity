import "@/lib/env/bootstrap";
import {
  getJurisdictionBySlug,
  getJurisdictions,
  getServiceSupabaseClientForJurisdiction
} from "@/lib/config/jurisdictions";
import { normalizeSummaryPoints } from "@/lib/utils/summaryPoints";
import { isUsableOfficialSourceText } from "@/lib/scraper/documentUsability";
import {
  findLlmInputBlockForCard,
  parseLlmInputItemBlocks,
  parseMeetingWideContext
} from "@/lib/utils/llmInputItems";
import {
  fetchLlmResponse,
  getLlmProvidersForInput,
  LLM_OPTIONAL_REQUEST_TIMEOUT_MS,
  providerCompletionTokenLimit,
  providerSpecificRequestFields
} from "@/lib/llm/provider";

const PAGE_SIZE = 500;
const JUDGE_MAX_SOURCE_CHARS = 7_000;
const JUDGE_MAX_COMPLETION_TOKENS = 900;
const JUDGE_CONCURRENCY = 4;

const APPROVAL = /\b(?:approved|adopted|pass(?:ed)?|carried|accepted|authorized|confirmed|granted)\b/i;
const FAILURE = /\b(?:denied|rejected|fail(?:ed)?|defeated|not adopted|not approved)\b/i;
const CONTINUED = /\b(?:continued|postponed|tabled|deferred|referred|held over)\b/i;
const AMENDED = /\bamend(?:ed|ment|ments|s)?\b/i;

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

function numberArgument(name: string, fallback: number) {
  const raw = argument(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid --${name}: ${raw}`);
  return Math.floor(parsed);
}

async function paged<T>(
  load: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  context: string,
  limit = Infinity
) {
  const rows: T[] = [];
  for (let from = 0; from < limit; from += PAGE_SIZE) {
    const { data, error } = await load(from, Math.min(from + PAGE_SIZE, limit) - 1);
    if (error) throw new Error(`${context}: ${error.message}`);
    const page = (Array.isArray(data) ? data : []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Deterministic sampling so repeat runs audit the same rows. */
function sample<T>(rows: T[], size: number, key: (row: T) => string) {
  if (rows.length <= size) return [...rows];
  return [...rows]
    .map((row) => {
      const id = key(row);
      let hash = 2166136261;
      for (let index = 0; index < id.length; index += 1) {
        hash ^= id.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return { row, hash };
    })
    .sort((left, right) => left.hash - right.hash)
    .slice(0, size)
    .map((entry) => entry.row);
}

function words(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function numericTokens(value: string) {
  return (value.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((token) => token.replace(/,/g, ""));
}

function sourceHasNumber(source: string, token: string) {
  const digits = source.replace(/,/g, "");
  return digits.includes(token);
}

async function pool<T, R>(items: T[], size: number, run: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function judge(system: string, payload: unknown) {
  const body = { system, payload };
  const providers = getLlmProvidersForInput(body, JUDGE_MAX_COMPLETION_TOKENS);
  if (providers.length === 0) throw new Error("No LLM provider is configured for the judge pass.");
  let lastError: unknown;
  for (const provider of providers) {
    try {
      const { response, text } = await fetchLlmResponse(
        provider.baseUrl,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: provider.model,
            ...providerSpecificRequestFields(provider),
            messages: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(payload, null, 2) }
            ],
            temperature: 0,
            max_tokens: providerCompletionTokenLimit(provider, JUDGE_MAX_COMPLETION_TOKENS),
            response_format: { type: "json_object" }
          })
        },
        LLM_OPTIONAL_REQUEST_TIMEOUT_MS,
        { label: `${provider.label} accuracy judge`, provider: provider.name }
      );
      if (!response.ok) throw new Error(`${provider.label} returned ${response.status}: ${text.slice(0, 200)}`);
      const content = (JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string } }>;
      }).choices?.[0]?.message?.content;
      if (!content) throw new Error(`${provider.label} returned no judge content.`);
      return JSON.parse(content) as Record<string, unknown>;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Judge request failed.");
}

const OUTCOME_JUDGE_SYSTEM = `You audit civic "decision outcome" records for factual accuracy against the official source excerpt they were derived from.

You receive: sourceText (verbatim official record), and the published record: kind, headline, summary, vote, nextStep, and the agenda item title of the card the record is attached to.

Return JSON only:
{
  "itemMatch": "yes" | "no" | "unclear",
  "kindVerdict": "supported" | "contradicted" | "unsupported",
  "headlineVerdict": "supported" | "contradicted" | "unsupported",
  "summaryVerdict": "supported" | "contradicted" | "unsupported",
  "voteVerdict": "supported" | "contradicted" | "unsupported" | "absent",
  "problems": ["short specific description of each inaccuracy"],
  "severity": "none" | "minor" | "major"
}

Rules:
- "supported" means the source excerpt states it or directly entails it.
- "contradicted" means the source says something different (e.g. record says approved, source says denied or continued).
- "unsupported" means the source excerpt does not establish it either way. Missing support is a real defect, not a pass.
- itemMatch: does the source excerpt describe an action on the SAME agenda item as the card title? "no" means the outcome is attached to the wrong item.
- "major" = a reader would be misled about what the body decided, or the outcome is on the wrong item. "minor" = wording or detail imprecision only.
- Judge only against sourceText. Do not use outside knowledge.`;

const CARD_JUDGE_SYSTEM = `You audit plain-language civic summary "cards" for factual accuracy.

sourceText is the COMPLETE text that was given to the model that wrote this card for this specific agenda item. Nothing else was available to it. So any specific fact in the card that is absent from sourceText was invented, and you should say so plainly.

You also receive meetingWideParticipationContext: the attendance and comment instructions the same model saw. Judge how-to-act and comment-window claims against it, not against sourceText.

You receive: sourceText, meetingWideParticipationContext, and the published card: agendaItem, whatIsHappening (bullets), whyItMatters, status, whoItAffects.

Return JSON only:
{
  "itemPresent": "yes" | "no" | "unclear",
  "bulletVerdicts": ["supported" | "contradicted" | "unsupported", ...],
  "whyItMattersVerdict": "supported" | "reasonable_inference" | "contradicted" | "unsupported",
  "statusVerdict": "consistent" | "contradicted",
  "fabricatedSpecifics": ["any number, date, dollar amount, address, name or deadline in the card that is absent from or conflicts with the source"],
  "problems": ["short specific description of each inaccuracy"],
  "severity": "none" | "minor" | "major"
}

Rules:
- One bulletVerdict per whatIsHappening bullet, in order.
- whyItMatters is interpretive: "reasonable_inference" if it follows from the source without adding facts; "unsupported" if it asserts facts the source lacks.
- itemPresent: does sourceText actually describe the same item as the card title? "no" means the card summarizes a different item.
- status is a category the pipeline assigns from a fixed list, NOT a quote from the source. Mark it "contradicted" only if it states the opposite of the source (e.g. "Passed" when the source shows the item failed). Never report it as unsupported, and never list it under fabricatedSpecifics.
- whoItAffects is an inferred audience label, not a source quote. Do not flag it as fabricated.
- fabricatedSpecifics is only for concrete factual details in agendaItem, whatIsHappening, or whyItMatters: numbers, dates, dollar amounts, addresses, org or person names, deadlines.
- "major" = a reader would be misled about what is being proposed or decided, or the card invents specifics. "minor" = imprecision only.
- Judge only against sourceText. Do not use outside knowledge.`;

type OutcomeRow = {
  id: string;
  summary_card_id: string;
  meeting_id: string;
  kind: string;
  headline: string;
  summary: string;
  vote: string | null;
  next_step: string | null;
  decided_at: string | null;
  source_url: string;
  source_text: string;
  matched_item_key: string;
  match_method: string;
  match_score: number;
};

type CardRow = {
  id: string;
  meeting_id: string | null;
  source_item_id: string | null;
  agenda_item: string | null;
  what_is_happening: string | string[] | null;
  what_is_happening_points: string[] | null;
  why_it_matters: string | null;
  who_it_affects: string[] | null;
  status: string | null;
  confidence: string | null;
  source_url: string | null;
  comment_window_opens: string | null;
  comment_window_closes: string | null;
};

type MeetingRow = {
  id: string;
  title: string;
  status: string | null;
  date_text: string | null;
  meeting_datetime: string | null;
};

function cardBullets(card: CardRow) {
  const points = normalizeSummaryPoints(card.what_is_happening_points);
  if (points.length > 0) return points;
  return normalizeSummaryPoints(card.what_is_happening);
}

function kindSupport(kind: string, source: string) {
  if (kind === "approved") {
    if (APPROVAL.test(source)) return "supported";
    return FAILURE.test(source) || CONTINUED.test(source) ? "contradicted" : "unsupported";
  }
  if (kind === "rejected") {
    if (FAILURE.test(source)) return "supported";
    return APPROVAL.test(source) ? "contradicted" : "unsupported";
  }
  if (kind === "continued") {
    if (CONTINUED.test(source)) return "supported";
    return "unsupported";
  }
  if (kind === "amended") {
    if (AMENDED.test(source)) return "supported";
    return "unsupported";
  }
  return "supported";
}

function meetingDate(meeting: MeetingRow | undefined) {
  const raw = meeting?.meeting_datetime || meeting?.date_text || null;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

async function main() {
  const requested = argument("jurisdiction") || "all";
  const outcomeSampleSize = numberArgument("outcome-sample", 30);
  const cardSampleSize = numberArgument("card-sample", 30);
  const skipJudge = flag("no-judge");
  const jurisdictions = requested === "all"
    ? getJurisdictions()
    : [getJurisdictionBySlug(requested)].filter(Boolean);
  if (jurisdictions.length === 0) throw new Error(`Unknown jurisdiction: ${requested}`);

  const allOutcomes: Array<OutcomeRow & { jurisdiction: string }> = [];
  const allCards: Array<CardRow & { jurisdiction: string }> = [];
  const meetingsById = new Map<string, MeetingRow>();
  const modelInputByMeeting = new Map<string, string>();
  const perJurisdiction: Array<Record<string, unknown>> = [];

  for (const jurisdiction of jurisdictions) {
    if (!jurisdiction) continue;
    const supabase = getServiceSupabaseClientForJurisdiction(jurisdiction.slug);

    const outcomes = await paged<OutcomeRow>(
      (from, to) => supabase
        .from("decision_outcomes")
        .select(
          "id,summary_card_id,meeting_id,kind,headline,summary,vote,next_step,decided_at,source_url,source_text,matched_item_key,match_method,match_score"
        )
        .eq("jurisdiction_slug", jurisdiction.slug)
        .range(from, to),
      `${jurisdiction.name} outcome read failed`
    );

    const cards = await paged<CardRow>(
      (from, to) => supabase
        .from("summary_cards")
        .select(
          "id,meeting_id,source_item_id,agenda_item,what_is_happening,what_is_happening_points,why_it_matters,who_it_affects,status,confidence,source_url,comment_window_opens,comment_window_closes,meetings!inner(status)"
        )
        .eq("jurisdiction_slug", jurisdiction.slug)
        .eq("is_published", true)
        .eq("meetings.status", "Past")
        .range(from, to),
      `${jurisdiction.name} card read failed`
    );

    const meetingIds = Array.from(
      new Set([
        ...outcomes.map((outcome) => outcome.meeting_id),
        ...cards.flatMap((card) => (card.meeting_id ? [card.meeting_id] : []))
      ])
    );
    for (let index = 0; index < meetingIds.length; index += 200) {
      const batch = meetingIds.slice(index, index + 200);
      const { data, error } = await supabase
        .from("meetings")
        .select("id,title,status,date_text,meeting_datetime")
        .in("id", batch);
      if (error) throw new Error(`${jurisdiction.name} meeting read failed: ${error.message}`);
      for (const meeting of (data || []) as MeetingRow[]) meetingsById.set(meeting.id, meeting);
    }

    for (const outcome of outcomes) allOutcomes.push({ ...outcome, jurisdiction: jurisdiction.slug });
    for (const card of cards) allCards.push({ ...card, jurisdiction: jurisdiction.slug });

    // Outcome coverage is only meaningful against meetings whose minutes we can
    // actually read: a meeting with no released minutes was never a candidate.
    // Every past meeting in the jurisdiction, not just those a card already
    // points at, or the denominator hides the meetings we failed to cover.
    const pastMeetings = await paged<{ id: string }>(
      (from, to) => supabase
        .from("meetings")
        .select("id")
        .eq("jurisdiction_slug", jurisdiction.slug)
        .eq("status", "Past")
        .range(from, to),
      `${jurisdiction.name} past meeting read failed`
    );
    const pastMeetingIds = new Set(pastMeetings.map((meeting) => meeting.id));
    const minutes = await paged<{ meeting_id: string | null; extracted_text: string | null }>(
      (from, to) => supabase
        .from("documents")
        .select("meeting_id,extracted_text")
        .eq("jurisdiction_slug", jurisdiction.slug)
        .in("type", ["Minutes", "Accessible Minutes"])
        .range(from, to),
      `${jurisdiction.name} minutes read failed`
    );
    const meetingsWithUsableMinutes = new Set(
      minutes
        .filter(
          (document) =>
            document.meeting_id &&
            pastMeetingIds.has(document.meeting_id) &&
            typeof document.extracted_text === "string" &&
            document.extracted_text.length > 0 &&
            isUsableOfficialSourceText(document.extracted_text)
        )
        .map((document) => document.meeting_id as string)
    );
    const meetingsWithOutcome = new Set(outcomes.map((outcome) => outcome.meeting_id));
    let coveredWithMinutes = 0;
    for (const meetingId of meetingsWithOutcome) {
      if (meetingsWithUsableMinutes.has(meetingId)) coveredWithMinutes += 1;
    }

    perJurisdiction.push({
      jurisdiction: jurisdiction.slug,
      publishedPastCards: cards.length,
      outcomes: outcomes.length,
      meetingsWithUsableMinutes: meetingsWithUsableMinutes.size,
      meetingsWithUsableMinutesAndAnOutcome: coveredWithMinutes,
      // The honest coverage number. Dividing by all published cards instead
      // blames the matcher for meetings that never had readable minutes.
      outcomeCoverageOfMinutesMeetingsPercent: meetingsWithUsableMinutes.size
        ? Math.round((coveredWithMinutes / meetingsWithUsableMinutes.size) * 1000) / 10
        : null
    });
  }

  // ---------- deterministic outcome grounding, every row ----------
  const outcomeFindings: Array<Record<string, unknown>> = [];
  let blanketMotionOutcomes = 0;
  let unnamedItemOutcomes = 0;
  let danglingIdentifier = 0;
  let bareStatusProvenance = 0;
  let missingVote = 0;
  const cardsById = new Map(allCards.map((card) => [card.id, card]));
  for (const outcome of allOutcomes) {
    const source = outcome.source_text || "";
    const problems: string[] = [];

    const trimmedSource = source.trim();
    // Provenance that is only a platform status flag quotes no motion text, so a
    // reader cannot see what the body actually did.
    if (/^(?:pass(?:ed)?|fail(?:ed)?|adopted|approved|denied|no action(?: taken)?)$/i.test(trimmedSource)) {
      bareStatusProvenance += 1;
      problems.push(`source_text is only the status token "${trimmedSource}" with no quoted motion text`);
    }
    // Minutes extraction sometimes stops right before the identifier a reader
    // needs to confirm which resolution or order was adopted.
    if (/\b(?:resolution|ordinance|order|item|no|number)\s*(?:no\.?|number)?$/i.test(trimmedSource)) {
      danglingIdentifier += 1;
      problems.push(`source_text ends on a dangling identifier label: "...${trimmedSource.slice(-45)}"`);
    }
    if (!outcome.vote) missingVote += 1;

    const support = kindSupport(outcome.kind, source);
    if (support !== "supported") {
      problems.push(`kind "${outcome.kind}" is ${support} by source_text`);
    }

    if (outcome.vote) {
      const missing = numericTokens(outcome.vote).filter((token) => !sourceHasNumber(source, token));
      if (missing.length > 0) problems.push(`vote "${outcome.vote}" has numbers absent from source_text (${missing.join(", ")})`);
    }


    const meeting = meetingsById.get(outcome.meeting_id);
    const decided = outcome.decided_at ? Date.parse(outcome.decided_at) : NaN;
    const meetingAt = meetingDate(meeting);
    if (!Number.isNaN(decided) && meetingAt !== null) {
      const dayGap = Math.abs(decided - meetingAt) / 86_400_000;
      if (dayGap > 1.5) problems.push(`decided_at is ${Math.round(dayGap)} days from the meeting date`);
    }

    const card = cardsById.get(outcome.summary_card_id);
    const titleTerms = words(card?.agenda_item).split(" ").filter((token) => token.length > 5);
    const sourceWords = words(source);
    const namesItem = titleTerms.some((token) => sourceWords.includes(token));
    const blanketMotion = !namesItem && /consent (?:calendar|agenda)/i.test(source);
    if (blanketMotion) blanketMotionOutcomes += 1;
    else if (!namesItem && titleTerms.length >= 3) unnamedItemOutcomes += 1;

    const summaryNumbers = numericTokens(outcome.summary).filter(
      (token) =>
        token.length > 2 &&
        !sourceHasNumber(source, token) &&
        !sourceHasNumber(String(card?.agenda_item || ""), token)
    );
    if (summaryNumbers.length > 0) {
      problems.push(
        `summary asserts numbers found in neither source_text nor the card title: ${summaryNumbers.join(", ")}`
      );
    }

    if (problems.length > 0) {
      outcomeFindings.push({
        jurisdiction: outcome.jurisdiction,
        outcomeId: outcome.id,
        cardId: outcome.summary_card_id,
        kind: outcome.kind,
        matchMethod: outcome.match_method,
        matchScore: outcome.match_score,
        headline: outcome.headline,
        cardTitle: card?.agenda_item || null,
        sourceUrl: outcome.source_url,
        problems
      });
    }
  }

  const matchMethodCounts: Record<string, number> = {};
  let lowScoreMatches = 0;
  for (const outcome of allOutcomes) {
    matchMethodCounts[outcome.match_method] = (matchMethodCounts[outcome.match_method] || 0) + 1;
    if (outcome.match_score < 0.85) lowScoreMatches += 1;
  }

  // ---------- deterministic card checks ----------
  const cardFindings: Array<Record<string, unknown>> = [];
  for (const card of allCards) {
    const problems: string[] = [];
    const bullets = cardBullets(card);
    if (bullets.length === 0) problems.push("no whatIsHappening bullets");
    if (!card.why_it_matters) problems.push("empty whyItMatters");
    const text = [card.agenda_item, ...bullets, card.why_it_matters].filter(Boolean).join(" ");
    if (/\bnot listed in the source document\b/i.test(String(card.agenda_item || "")) ||
      bullets.some((bullet) => /\bnot listed in the source document\b/i.test(bullet))) {
      problems.push("placeholder text leaked into card body");
    }
    if (/\b(?:will|to be) (?:considered|heard|decided)\b/i.test(text) && /\bupcoming\b/i.test(String(card.status || ""))) {
      problems.push(`status "${card.status}" is future-tense on a past meeting`);
    }
    if (problems.length > 0) {
      cardFindings.push({
        jurisdiction: card.jurisdiction,
        cardId: card.id,
        agendaItem: card.agenda_item,
        status: card.status,
        confidence: card.confidence,
        problems
      });
    }
  }

  const report: Record<string, unknown> = {
    generatedFor: requested,
    perJurisdiction,
    totals: {
      publishedPastCards: allCards.length,
      decisionOutcomes: allOutcomes.length,
      outcomeCoveragePercent: allCards.length
        ? Math.round((allOutcomes.length / allCards.length) * 1000) / 10
        : 0,
      matchMethodCounts,
      outcomesWithMatchScoreBelow085: lowScoreMatches
    },
    attribution: {
      outcomesFromBlanketConsentMotion: blanketMotionOutcomes,
      blanketConsentMotionPercent: allOutcomes.length
        ? Math.round((blanketMotionOutcomes / allOutcomes.length) * 1000) / 10
        : 0,
      outcomesWhoseSourceExcerptNeverNamesTheItem: unnamedItemOutcomes,
      outcomesWhoseProvenanceIsOnlyAStatusToken: bareStatusProvenance,
      outcomesWithTruncatedIdentifierInProvenance: danglingIdentifier,
      outcomesWithNoRecordedVote: missingVote,
      note:
        "Blanket consent-calendar motions are legitimate but their excerpt does not name the item, " +
        "so correctness rests on agenda-structure matching rather than the quoted text."
    },
    deterministic: {
      outcomesWithGroundingProblems: outcomeFindings.length,
      outcomeProblemRatePercent: allOutcomes.length
        ? Math.round((outcomeFindings.length / allOutcomes.length) * 1000) / 10
        : 0,
      cardsWithStructuralProblems: cardFindings.length,
      outcomeFindings: outcomeFindings.slice(0, 40),
      cardFindings: cardFindings.slice(0, 40)
    }
  };

  if (!skipJudge) {
    const outcomeSample = sample(allOutcomes, outcomeSampleSize, (outcome) => outcome.id);
    const judgedOutcomes = await pool(outcomeSample, JUDGE_CONCURRENCY, async (outcome) => {
      const card = cardsById.get(outcome.summary_card_id);
      try {
        const verdict = await judge(OUTCOME_JUDGE_SYSTEM, {
          sourceText: (outcome.source_text || "").slice(0, JUDGE_MAX_SOURCE_CHARS),
          cardAgendaItem: card?.agenda_item || outcome.matched_item_key,
          kind: outcome.kind,
          headline: outcome.headline,
          summary: outcome.summary,
          vote: outcome.vote,
          nextStep: outcome.next_step
        });
        return {
          jurisdiction: outcome.jurisdiction,
          outcomeId: outcome.id,
          sourceUrl: outcome.source_url,
          matchMethod: outcome.match_method,
          matchScore: outcome.match_score,
          headline: outcome.headline,
          verdict
        };
      } catch (error) {
        return {
          jurisdiction: outcome.jurisdiction,
          outcomeId: outcome.id,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    // A card must be judged against the exact per-item text the summary model
    // was given, which the pipeline persists as meetings.llm_input_text.
    // Retrieving anything looser makes grounded details look invented.
    const cardSample = sample(
      allCards.filter((card) => card.meeting_id && cardBullets(card).length > 0),
      cardSampleSize,
      (card) => card.id
    );
    const staleInputMeetings = new Set<string>();
    const meetingsBySlug = new Map<string, Set<string>>();
    for (const card of cardSample) {
      if (!card.meeting_id) continue;
      const known = meetingsBySlug.get(card.jurisdiction) || new Set<string>();
      known.add(card.meeting_id);
      meetingsBySlug.set(card.jurisdiction, known);
    }
    for (const [slug, meetingIds] of meetingsBySlug) {
      const supabase = getServiceSupabaseClientForJurisdiction(slug);
      const ids = Array.from(meetingIds);
      for (let index = 0; index < ids.length; index += 50) {
        const { data, error } = await supabase
          .from("meetings")
          .select("id,llm_input_text,source_hash,summarized_source_hash")
          .in("id", ids.slice(index, index + 50));
        if (error) throw new Error(`${slug} model input read failed: ${error.message}`);
        for (const meeting of (data || []) as Array<{
          id: string;
          llm_input_text: string | null;
          source_hash: string | null;
          summarized_source_hash: string | null;
        }>) {
          // Every scrape overwrites llm_input_text. Only when the meeting has not
          // changed since its cards were written is the stored text the input the
          // model actually saw; otherwise "absent from source" proves nothing.
          const inSync =
            Boolean(meeting.source_hash) &&
            meeting.source_hash === meeting.summarized_source_hash;
          if (!inSync) {
            staleInputMeetings.add(meeting.id);
            continue;
          }
          if (meeting.llm_input_text) modelInputByMeeting.set(meeting.id, meeting.llm_input_text);
        }
      }
    }

    const judgedCards = await pool(cardSample, JUDGE_CONCURRENCY, async (card) => {
      const modelInput = modelInputByMeeting.get(card.meeting_id || "");
      const blocks = parseLlmInputItemBlocks(modelInput);
      const block = findLlmInputBlockForCard(blocks, {
        sourceItemId: card.source_item_id,
        agendaItem: card.agenda_item
      });
      if (block && !block.isComplete) {
        return {
          jurisdiction: card.jurisdiction,
          cardId: card.id,
          agendaItem: card.agenda_item,
          skipped:
            "stored item block was trimmed to fit the meeting-level budget, so it is not the text the model saw"
        };
      }
      if (!block) {
        // Reported, never silently dropped: an unscoped card is unaudited, and
        // counting it as clean would overstate accuracy.
        return {
          jurisdiction: card.jurisdiction,
          cardId: card.id,
          agendaItem: card.agenda_item,
          skipped: staleInputMeetings.has(card.meeting_id || "")
            ? "meeting re-scraped since these cards were written, so its stored input is not what produced them"
            : !modelInput
            ? "no stored model input for this meeting"
            : blocks.length === 0
              ? "stored model input has no per-item blocks"
              : "card could not be scoped to one item block"
        };
      }
      try {
        const verdict = await judge(CARD_JUDGE_SYSTEM, {
          sourceText: block.text.slice(0, JUDGE_MAX_SOURCE_CHARS),
          meetingWideParticipationContext:
            parseMeetingWideContext(modelInput)?.slice(0, 2_500) || null,
          agendaItem: card.agenda_item,
          whatIsHappening: cardBullets(card),
          whyItMatters: card.why_it_matters,
          status: card.status,
          whoItAffects: card.who_it_affects
        });
        return {
          jurisdiction: card.jurisdiction,
          cardId: card.id,
          agendaItem: card.agenda_item,
          confidence: card.confidence,
          sourceUrl: card.source_url,
          verdict
        };
      } catch (error) {
        return {
          jurisdiction: card.jurisdiction,
          cardId: card.id,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    const outcomeVerdicts = judgedOutcomes.filter((entry) => "verdict" in entry) as Array<{
      verdict: Record<string, string | string[]>;
    }>;
    const cardVerdicts = judgedCards.filter((entry) => "verdict" in entry) as Array<{
      verdict: Record<string, string | string[]>;
    }>;
    const count = (rows: Array<{ verdict: Record<string, unknown> }>, field: string, value: string) =>
      rows.filter((row) => row.verdict[field] === value).length;

    report.judged = {
      outcomes: {
        sampled: judgedOutcomes.length,
        graded: outcomeVerdicts.length,
        errors: judgedOutcomes.length - outcomeVerdicts.length,
        majorSeverity: count(outcomeVerdicts, "severity", "major"),
        minorSeverity: count(outcomeVerdicts, "severity", "minor"),
        clean: count(outcomeVerdicts, "severity", "none"),
        wrongItemAttachment: count(outcomeVerdicts, "itemMatch", "no"),
        kindContradicted: count(outcomeVerdicts, "kindVerdict", "contradicted"),
        kindUnsupported: count(outcomeVerdicts, "kindVerdict", "unsupported"),
        summaryContradicted: count(outcomeVerdicts, "summaryVerdict", "contradicted"),
        summaryUnsupported: count(outcomeVerdicts, "summaryVerdict", "unsupported"),
        voteContradicted: count(outcomeVerdicts, "voteVerdict", "contradicted"),
        details: judgedOutcomes
      },
      cards: {
        sampled: judgedCards.length,
        graded: cardVerdicts.length,
        // Coverage is stated up front: a low audited share means the accuracy
        // rates below describe only part of the published set.
        auditedPercent: judgedCards.length
          ? Math.round((cardVerdicts.length / judgedCards.length) * 1000) / 10
          : 0,
        skipped: judgedCards.filter((entry) => "skipped" in entry).length,
        skipReasons: judgedCards.reduce<Record<string, number>>((counts, entry) => {
          const reason = (entry as { skipped?: string }).skipped;
          if (reason) counts[reason] = (counts[reason] || 0) + 1;
          return counts;
        }, {}),
        errors: judgedCards.filter((entry) => "error" in entry).length,
        majorSeverity: count(cardVerdicts, "severity", "major"),
        minorSeverity: count(cardVerdicts, "severity", "minor"),
        clean: count(cardVerdicts, "severity", "none"),
        wrongItem: count(cardVerdicts, "itemPresent", "no"),
        contradictedBullets: cardVerdicts.reduce(
          (total, row) => total + ((row.verdict.bulletVerdicts as string[]) || []).filter((verdict) => verdict === "contradicted").length,
          0
        ),
        unsupportedBullets: cardVerdicts.reduce(
          (total, row) => total + ((row.verdict.bulletVerdicts as string[]) || []).filter((verdict) => verdict === "unsupported").length,
          0
        ),
        totalBullets: cardVerdicts.reduce(
          (total, row) => total + ((row.verdict.bulletVerdicts as string[]) || []).length,
          0
        ),
        cardsWithFabricatedSpecifics: cardVerdicts.filter(
          (row) => ((row.verdict.fabricatedSpecifics as string[]) || []).length > 0
        ).length,
        details: judgedCards
      }
    };
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
