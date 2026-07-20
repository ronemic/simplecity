import { jsonrepair } from "jsonrepair";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { decisionOutcomeTranslationIssues } from "@/lib/i18n/decisionOutcome";

export type TranslationLocale = "es";

export type MeetingTranslationInput = {
  id: string;
  title: string;
  meeting_type: string | null;
};

export type SummaryCardTranslationInput = {
  id: string;
  agenda_item: string | null;
  what_is_happening: string[] | null;
  why_it_matters: string | null;
  who_it_affects: string[] | null;
  status: string | null;
  comment_window_opens: string | null;
  comment_window_closes: string | null;
  how_to_act_attend: string | null;
  how_to_act_email: string | null;
  how_to_act_submit_comment: string | null;
};

export type DecisionOutcomeTranslationInput = {
  id: string;
  headline: string;
  summary: string;
  vote: string | null;
  next_step: string | null;
};

export type MeetingTranslationOutput = MeetingTranslationInput;
export type SummaryCardTranslationOutput = SummaryCardTranslationInput;
export type DecisionOutcomeTranslationOutput = DecisionOutcomeTranslationInput;

type TranslationPayload = {
  locale: TranslationLocale;
  meetings?: MeetingTranslationInput[];
  cards?: SummaryCardTranslationInput[];
  outcomes?: DecisionOutcomeTranslationInput[];
};

type TranslationResult = {
  meetings?: MeetingTranslationOutput[];
  cards?: SummaryCardTranslationOutput[];
  outcomes?: DecisionOutcomeTranslationOutput[];
};

export type GenerateTranslationsOptions = {
  log?: (message: string) => void;
};

type TranslationProvider = {
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
};

function configuredTranslationProviders() {
  const providers: TranslationProvider[] = [];
  const referer = getConfiguredAppUrl();
  const openRouterKeys = [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);
  const cerebrasKeys = [
    process.env.CEREBRAS_API_KEY,
    process.env.CEREBRAS_API_KEY_2,
    process.env.CEREBRAS_API_KEY_3
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);

  openRouterKeys.forEach((apiKey, index) => {
    providers.push({
      label: openRouterKeys.length > 1 ? `OpenRouter key ${index + 1}` : "OpenRouter",
      apiKey,
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model:
        process.env.OPENROUTER_TRANSLATION_MODEL ||
        process.env.OPENROUTER_MODEL ||
        "google/gemma-4-31b-it:free",
      headers: {
        "HTTP-Referer": referer,
        "X-OpenRouter-Title": "SimpleCity Translation"
      }
    });
  });
  cerebrasKeys.forEach((apiKey, index) => {
    providers.push({
      label: cerebrasKeys.length > 1 ? `Cerebras key ${index + 1}` : "Cerebras",
      apiKey,
      baseUrl: "https://api.cerebras.ai/v1/chat/completions",
      model: process.env.CEREBRAS_MODEL || "gpt-oss-120b"
    });
  });
  return providers;
}

export function hasTranslationProvider() {
  return configuredTranslationProviders().length > 0;
}

const TRANSLATION_SYSTEM_PROMPT = `You translate SimpleCity public-facing civic text from English into Spanish.

Rules:
- Translate only the provided field values.
- Return the same JSON shape with the same ids.
- Do not add facts, remove facts, summarize, interpret, or explain.
- Preserve URLs, email addresses, phone numbers, addresses, proper names, agency names, dates, times, dollar amounts, percentages, ordinance numbers, resolution numbers, agenda item numbers, decimals, and source-specific identifiers exactly as written.
- Preserve only cards[].status values exactly as written. Do not translate card status values like "Upcoming vote", "Routine approval", "Information only", "Under discussion", "Passed", or "Cancelled".
- Translate every non-null public field in outcomes[], including status-like headlines such as "Passed", vote descriptions such as "Unanimous", summaries, and next steps. Preserve numeric vote counts exactly.
- Every outcomes[] field must be fully Spanish. Never leave English clauses or labels such as "Motion and second", "to approve", "passed", "No action taken", "City Council", "Commission Regular Meeting", "Approved Minutes", "ACTION", "staff report", or "Informational Items" in the translation. Translate generic civic body names and document labels; preserve only people's names, street/place names, formal program names, identifiers, and numbers.
- A Spanish introductory phrase followed by the original English text is invalid. Translate the complete outcome sentence from beginning to end.
- Preserve null values as null and arrays as arrays.
- Translate "Not listed in the source document." consistently as "No indicado en el documento fuente."
- Translate the outcome headline "No action taken" as "No se tomó ninguna medida" and the exact summary "The official minutes record this item as No action." as "El acta oficial registra que no se tomó ninguna medida sobre este punto."
- Use clear, neutral Spanish for public civic information.
- Return ONLY valid JSON. No markdown. No commentary.`;

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return JSON.parse(jsonrepair(value));
  }
}

function requireObject(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} was not an object.`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, context: string) {
  if (typeof value !== "string") throw new Error(`${context} was not a string.`);
  return value;
}

function optionalString(value: unknown, context: string) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${context} was not a string or null.`);
  return value;
}

function optionalStringArray(value: unknown, context: string) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${context} was not a string array or null.`);
  }
  return value as string[];
}

function parseMeeting(value: unknown): MeetingTranslationOutput {
  const row = requireObject(value, "Meeting translation");
  return {
    id: requireString(row.id, "Meeting translation id"),
    title: requireString(row.title, "Meeting translation title"),
    meeting_type: optionalString(row.meeting_type, "Meeting translation meeting_type")
  };
}

function parseCard(value: unknown): SummaryCardTranslationOutput {
  const row = requireObject(value, "Card translation");
  return {
    id: requireString(row.id, "Card translation id"),
    agenda_item: optionalString(row.agenda_item, "Card translation agenda_item"),
    what_is_happening: optionalStringArray(row.what_is_happening, "Card translation what_is_happening"),
    why_it_matters: optionalString(row.why_it_matters, "Card translation why_it_matters"),
    who_it_affects: optionalStringArray(row.who_it_affects, "Card translation who_it_affects"),
    status: optionalString(row.status, "Card translation status"),
    comment_window_opens: optionalString(row.comment_window_opens, "Card translation comment_window_opens"),
    comment_window_closes: optionalString(row.comment_window_closes, "Card translation comment_window_closes"),
    how_to_act_attend: optionalString(row.how_to_act_attend, "Card translation how_to_act_attend"),
    how_to_act_email: optionalString(row.how_to_act_email, "Card translation how_to_act_email"),
    how_to_act_submit_comment: optionalString(
      row.how_to_act_submit_comment,
      "Card translation how_to_act_submit_comment"
    )
  };
}

function parseOutcome(value: unknown): DecisionOutcomeTranslationOutput {
  const row = requireObject(value, "Decision outcome translation");
  return {
    id: requireString(row.id, "Decision outcome translation id"),
    headline: requireString(row.headline, "Decision outcome translation headline"),
    summary: requireString(row.summary, "Decision outcome translation summary"),
    vote: optionalString(row.vote, "Decision outcome translation vote"),
    next_step: optionalString(row.next_step, "Decision outcome translation next_step")
  };
}

function parseTranslationResult(content: string): TranslationResult {
  const parsed = requireObject(parseJsonObject(content), "Translation response");
  const result: TranslationResult = {};

  if (parsed.meetings !== undefined) {
    if (!Array.isArray(parsed.meetings)) throw new Error("Translation response meetings was not an array.");
    result.meetings = parsed.meetings.map(parseMeeting);
  }

  if (parsed.cards !== undefined) {
    if (!Array.isArray(parsed.cards)) throw new Error("Translation response cards was not an array.");
    result.cards = parsed.cards.map(parseCard);
  }

  if (parsed.outcomes !== undefined) {
    if (!Array.isArray(parsed.outcomes)) {
      throw new Error("Translation response outcomes was not an array.");
    }
    result.outcomes = parsed.outcomes.map(parseOutcome);
  }

  return result;
}

function validateIds(input: TranslationPayload, result: TranslationResult) {
  const expectedMeetingIds = new Set((input.meetings || []).map((row) => row.id));
  const actualMeetingIds = new Set((result.meetings || []).map((row) => row.id));
  const expectedCardIds = new Set((input.cards || []).map((row) => row.id));
  const actualCardIds = new Set((result.cards || []).map((row) => row.id));
  const expectedOutcomeIds = new Set((input.outcomes || []).map((row) => row.id));
  const actualOutcomeIds = new Set((result.outcomes || []).map((row) => row.id));

  for (const id of expectedMeetingIds) {
    if (!actualMeetingIds.has(id)) throw new Error(`Translation response omitted meeting ${id}.`);
  }

  for (const id of expectedCardIds) {
    if (!actualCardIds.has(id)) throw new Error(`Translation response omitted card ${id}.`);
  }

  for (const id of expectedOutcomeIds) {
    if (!actualOutcomeIds.has(id)) throw new Error(`Translation response omitted outcome ${id}.`);
  }

  const outcomeResults = new Map((result.outcomes || []).map((row) => [row.id, row]));
  for (const source of input.outcomes || []) {
    const translation = outcomeResults.get(source.id);
    if (!translation) continue;
    const issues = decisionOutcomeTranslationIssues(source, translation);
    if (issues.length > 0) {
      throw new Error(
        `Translation response left outcome ${source.id} incomplete: ${issues.join(", ")}.`
      );
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryProviderError(status: number, text: string) {
  return status === 429 || status >= 500 || text.toLowerCase().includes("rate-limited");
}

async function requestTranslations(
  provider: TranslationProvider,
  input: TranslationPayload,
  options: GenerateTranslationsOptions
): Promise<{ translations: TranslationResult; raw: unknown }> {
  let lastErrorText = "";
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const response = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...(provider.headers || {})
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: "system",
            content: TRANSLATION_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: JSON.stringify(input, null, 2)
          }
        ],
        temperature: 0.1,
        response_format: {
          type: "json_object"
        }
      })
    }).finally(() => clearTimeout(timeout));

    if (response.ok) {
      const raw = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = raw.choices?.[0]?.message?.content;

      try {
        if (!content) throw new Error(`${provider.label} returned no translation content.`);
        const translations = parseTranslationResult(content);
        validateIds(input, translations);

        return {
          translations,
          raw
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown translation parse error";
        lastErrorText = `${message}${content ? `: ${content.slice(0, 300)}` : ""}`;
        if (attempt === maxAttempts) {
          throw new Error(`${provider.label} translation response could not be parsed: ${lastErrorText}`);
        }

        const delayMs = attempt * 5_000;
        options.log?.(
          `${provider.label} returned invalid translation JSON; retrying in ${Math.round(delayMs / 1000)}s.`
        );
        await sleep(delayMs);
        continue;
      }
    }

    lastErrorText = await response.text();
    if (attempt === maxAttempts || !shouldRetryProviderError(response.status, lastErrorText)) {
      throw new Error(
        `${provider.label} translation request failed with ${response.status}: ${lastErrorText.slice(0, 500)}`
      );
    }

    const delayMs = attempt * 15_000;
    options.log?.(
      `${provider.label} translation request was rate-limited or unavailable; retrying in ${Math.round(delayMs / 1000)}s.`
    );
    await sleep(delayMs);
  }

  throw new Error(`${provider.label} translation request failed: ${lastErrorText.slice(0, 500)}`);
}

export async function generateTranslations(
  input: TranslationPayload,
  options: GenerateTranslationsOptions = {}
): Promise<{ translations: TranslationResult; raw: unknown }> {
  const providers = configuredTranslationProviders();
  if (providers.length === 0) throw new Error("No translation provider is configured.");

  options.log?.(
    `Requesting ${input.locale} translations for ${(input.meetings || []).length} meetings, ${(input.cards || []).length} cards, and ${(input.outcomes || []).length} decision outcomes.`
  );

  let lastError: unknown;
  for (const provider of providers) {
    try {
      options.log?.(`Translating with ${provider.label}.`);
      return await requestTranslations(provider, input, options);
    } catch (error) {
      lastError = error;
      options.log?.(`${provider.label} translation failed; trying the next provider.`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Translation generation failed.");
}
