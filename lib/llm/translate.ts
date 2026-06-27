import { jsonrepair } from "jsonrepair";

export type TranslationLocale = "es";

export type MeetingTranslationInput = {
  id: string;
  title: string;
  meeting_type: string | null;
};

export type SummaryCardTranslationInput = {
  id: string;
  agenda_item: string | null;
  what_is_happening: string | null;
  why_it_matters: string | null;
  who_it_affects: string[] | null;
  status: string | null;
  comment_window_opens: string | null;
  comment_window_closes: string | null;
  how_to_act_attend: string | null;
  how_to_act_email: string | null;
  how_to_act_submit_comment: string | null;
};

export type MeetingTranslationOutput = MeetingTranslationInput;
export type SummaryCardTranslationOutput = SummaryCardTranslationInput;

type TranslationPayload = {
  locale: TranslationLocale;
  meetings?: MeetingTranslationInput[];
  cards?: SummaryCardTranslationInput[];
};

type TranslationResult = {
  meetings?: MeetingTranslationOutput[];
  cards?: SummaryCardTranslationOutput[];
};

export type GenerateTranslationsOptions = {
  log?: (message: string) => void;
};

const TRANSLATION_SYSTEM_PROMPT = `You translate SimpleCity public-facing civic text from English into Spanish.

Rules:
- Translate only the provided field values.
- Return the same JSON shape with the same ids.
- Do not add facts, remove facts, summarize, interpret, or explain.
- Preserve URLs, email addresses, phone numbers, addresses, proper names, agency names, dates, times, dollar amounts, percentages, ordinance numbers, resolution numbers, agenda item numbers, decimals, and source-specific identifiers exactly as written.
- Preserve card status values exactly as written. Do not translate values like "Upcoming vote", "Information only", "Under discussion", "Passed", or "Cancelled".
- Preserve null values as null and arrays as arrays.
- Translate "Not listed in the source document." consistently as "No indicado en el documento fuente."
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
    what_is_happening: optionalString(row.what_is_happening, "Card translation what_is_happening"),
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

  return result;
}

function validateIds(input: TranslationPayload, result: TranslationResult) {
  const expectedMeetingIds = new Set((input.meetings || []).map((row) => row.id));
  const actualMeetingIds = new Set((result.meetings || []).map((row) => row.id));
  const expectedCardIds = new Set((input.cards || []).map((row) => row.id));
  const actualCardIds = new Set((result.cards || []).map((row) => row.id));

  for (const id of expectedMeetingIds) {
    if (!actualMeetingIds.has(id)) throw new Error(`Translation response omitted meeting ${id}.`);
  }

  for (const id of expectedCardIds) {
    if (!actualCardIds.has(id)) throw new Error(`Translation response omitted card ${id}.`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryOpenRouterError(status: number, text: string) {
  return status === 429 || status >= 500 || text.toLowerCase().includes("rate-limited");
}

export async function generateTranslations(
  input: TranslationPayload,
  options: GenerateTranslationsOptions = {}
): Promise<{ translations: TranslationResult; raw: unknown }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY.");

  const model = process.env.OPENROUTER_TRANSLATION_MODEL || process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
  const referer = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  options.log?.(
    `Requesting ${input.locale} translations for ${(input.meetings || []).length} meetings and ${(input.cards || []).length} cards.`
  );

  let lastErrorText = "";

  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-OpenRouter-Title": "SimpleCity Translation"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
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
        if (!content) throw new Error("OpenRouter translation response did not include message content.");
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
          throw new Error(`OpenRouter translation response could not be parsed: ${lastErrorText}`);
        }

        const delayMs = attempt * 5_000;
        options.log?.(
          `OpenRouter returned invalid translation JSON; retrying in ${Math.round(delayMs / 1000)}s.`
        );
        await sleep(delayMs);
        continue;
      }
    }

    lastErrorText = await response.text();
    if (attempt === maxAttempts || !shouldRetryOpenRouterError(response.status, lastErrorText)) {
      throw new Error(
        `OpenRouter translation request failed with ${response.status}: ${lastErrorText.slice(0, 500)}`
      );
    }

    const delayMs = attempt * 15_000;
    options.log?.(
      `OpenRouter translation request was rate-limited or unavailable; retrying in ${Math.round(delayMs / 1000)}s.`
    );
    await sleep(delayMs);
  }

  throw new Error(`OpenRouter translation request failed: ${lastErrorText.slice(0, 500)}`);
}
