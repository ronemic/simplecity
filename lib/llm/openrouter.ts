import "@/lib/env/bootstrap";
import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";
import { buildSimpleCityUserPrompt, SIMPLECITY_SYSTEM_PROMPT } from "./prompts";
import { parseAndValidateSummary } from "./validateSummary";

export type GenerateSummaryOptions = {
  log?: (message: string) => void;
};

export async function generateSummaryForMeeting(
  meeting: LlmReadyMeeting,
  options: GenerateSummaryOptions = {}
): Promise<{ summary: SimpleCitySummary; raw: unknown }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY.");

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
  const referer = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  options.log?.(`Starting LLM summary for ${meeting.title}.`);

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

  const summary = parseAndValidateSummary(content);
  options.log?.(`Finished LLM summary for ${meeting.title}: ${summary.cards.length} cards.`);

  return { summary, raw };
}
