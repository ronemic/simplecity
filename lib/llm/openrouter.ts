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

type SummaryRequestResult = {
  summary: SimpleCitySummary;
  raw: unknown;
  validationIssues: SummaryValidationIssue[];
};

function hasUsableSourceText(meeting: LlmReadyMeeting) {
  const input = meeting.llmInputText.trim();
  return meeting.status === "Cancelled" ? input.length > 0 : input.length >= 300;
}

function summarizeValidationIssues(issues: SummaryValidationIssue[]) {
  return issues
    .slice(0, 6)
    .map((issue) => {
      const label = issue.agendaItem ? `${issue.agendaItem}: ` : "";
      const value = issue.value ? ` (${issue.value})` : "";
      return `- ${label}${issue.reason}${value}`;
    })
    .join("\n");
}

function shouldRegenerateSummary(meeting: LlmReadyMeeting, result: SummaryRequestResult) {
  if (result.validationIssues.length > 0) return true;
  return result.summary.cards.length === 0 && hasUsableSourceText(meeting);
}

function buildRegenerationGuidance(meeting: LlmReadyMeeting, result: SummaryRequestResult) {
  const issueSummary = result.validationIssues.length
    ? summarizeValidationIssues(result.validationIssues)
    : "- The previous response returned no cards even though usable source text was available.";

  return `Regenerate the SimpleCity JSON for this meeting.

The previous response could not be fully used:
${issueSummary}

Re-check the raw agenda text item by item. Include every non-routine, source-supported item with public impact. Also include transparency routine items when the source gives enough detail for residents to verify the record or understand participation, such as consequential minutes approvals, grouped consent-calendar summaries, agenda changes, public-comment instructions, meaningful staff updates, decision-making appointments, listed closed-session topics, relevant proclamations, cancellations, continuances, special meeting notices, and named ceremonial adjournments.

Keep the strict grounding rules: use only exact values visible in the provided text, write "Not listed in the source document." when a detail is missing, and use one of the official source URLs from the meeting metadata. If the source text is partial, noisy, row-only, or truncated, keep the card only when the core item is visible and set confidence to "medium" or "low". If there truly are no non-routine or transparency-worthy source-supported items, return an empty cards array.`;
}

function isBetterSummaryResult(candidate: SummaryRequestResult, current: SummaryRequestResult) {
  if (candidate.summary.cards.length !== current.summary.cards.length) {
    return candidate.summary.cards.length > current.summary.cards.length;
  }

  return candidate.validationIssues.length < current.validationIssues.length;
}

async function requestSummary(
  meeting: LlmReadyMeeting,
  options: GenerateSummaryOptions = {},
  regenerationGuidance?: string
): Promise<SummaryRequestResult> {
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
        },
        ...(regenerationGuidance
          ? [
              {
                role: "user",
                content: regenerationGuidance
              }
            ]
          : [])
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
        issues: validationIssues,
        regenerated: Boolean(regenerationGuidance)
      }
    },
    validationIssues
  };
}

export async function generateSummaryForMeeting(
  meeting: LlmReadyMeeting,
  options: GenerateSummaryOptions = {}
): Promise<{ summary: SimpleCitySummary; raw: unknown }> {
  options.log?.(`Starting LLM summary for ${meeting.title}.`);

  let lastError: unknown;
  let bestResult: SummaryRequestResult | null = null;
  let regenerationGuidance: string | undefined;
  let usedRegenerationAttempt = false;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await requestSummary(meeting, options, regenerationGuidance);
      if (!bestResult || isBetterSummaryResult(result, bestResult)) {
        bestResult = result;
      }

      if (!usedRegenerationAttempt && shouldRegenerateSummary(meeting, result)) {
        usedRegenerationAttempt = true;
        regenerationGuidance = buildRegenerationGuidance(meeting, result);
        options.log?.(
          `Regenerating LLM summary for ${meeting.title}; first response produced ${result.summary.cards.length} cards and ${result.validationIssues.length} validation issues.`
        );
        continue;
      }

      const finalResult = bestResult;
      options.log?.(
        `Finished LLM summary for ${meeting.title}: ${finalResult.summary.cards.length} cards.`
      );
      return {
        summary: finalResult.summary,
        raw: finalResult.raw
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "Unknown LLM error";
      if (attempt < 3) {
        options.log?.(`Retrying LLM summary for ${meeting.title}: ${message}`);
      }
    }
  }

  if (bestResult) {
    options.log?.(
      `Using best validated LLM summary for ${meeting.title} after retry errors: ${bestResult.summary.cards.length} cards.`
    );
    return {
      summary: bestResult.summary,
      raw: bestResult.raw
    };
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown LLM error");
}
