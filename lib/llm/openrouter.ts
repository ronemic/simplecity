import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";
import { buildSimpleCityUserPrompt, SIMPLECITY_SYSTEM_PROMPT } from "./prompts";
import {
  parseAndValidateSummary,
  validationOptionsForMeeting,
  type SummaryValidationIssue
} from "./validateSummary";

export type GenerateSummaryOptions = {
  log?: (message: string) => void;
};

async function requestSummary(meeting: LlmReadyMeeting, options: GenerateSummaryOptions = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY.");

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
  const referer = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-OpenRouter-Title": "SimpleCity"
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: SIMPLECITY_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildSimpleCityUserPrompt(meeting)
        }
      ],
      temperature: 0.2,
      response_format: {
        type: "json_object"
      }
    })
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed with ${response.status}: ${text.slice(0, 500)}`);
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = raw.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter response did not include message content.");

  const validationIssues: SummaryValidationIssue[] = [];
  const summary = parseAndValidateSummary(
    content,
    validationOptionsForMeeting(meeting, (issue) => validationIssues.push(issue))
  );

  for (const issue of validationIssues) {
    options.log?.(
      `Summary validation issue for ${meeting.title}: ${issue.reason}${
        issue.value ? ` (${issue.value})` : ""
      }`
    );
  }

  return {
    summary,
    raw: {
      ...raw,
      simplecityValidation: {
        issues: validationIssues
      }
    }
  };
}

export async function generateSummaryForMeeting(
  meeting: LlmReadyMeeting,
  options: GenerateSummaryOptions = {}
): Promise<{ summary: SimpleCitySummary; raw: unknown }> {
  options.log?.(`Starting LLM summary for ${meeting.title}.`);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await requestSummary(meeting, options);
      options.log?.(`Finished LLM summary for ${meeting.title}: ${result.summary.cards.length} cards.`);
      return result;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "Unknown LLM error";
      if (attempt < 2) {
        options.log?.(`Retrying LLM summary for ${meeting.title}: ${message}`);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown LLM error");
}
