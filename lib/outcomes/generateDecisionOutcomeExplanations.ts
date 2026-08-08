import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import type { DecisionOutcomeCanonicalStatus } from "@/lib/outcomes/extractDecisionOutcome";
import {
  nonNegativeNumberEnv,
  observeLlmRateLimitHeaders,
  positiveIntegerEnv,
  waitForLlmCapacity
} from "@/lib/llm/requestPolicy";

export type DecisionOutcomeExplanationInput = {
  id: string;
  title: string;
  canonicalStatus: DecisionOutcomeCanonicalStatus;
  canonicalHeadline: string;
  fallbackSummary: string;
  fallbackNextStep: string | null;
  sourceContext: string;
};

export type DecisionOutcomeExplanation = {
  summary: string;
  nextStep: string | null;
};

type ExplanationProvider = {
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
};

const ExplanationResponseSchema = z.object({
  outcomes: z.array(
    z.object({
      id: z.string().min(1),
      canonicalHeadline: z.string().min(1),
      summary: z.string().min(20).max(700),
      nextStep: z.string().min(5).max(350).nullable().optional()
    })
  )
});

export const DECISION_OUTCOME_EXPLANATION_SYSTEM_PROMPT = `You write concise, source-grounded civic decision explanations.

The supplied canonical status and headline are authoritative and must never be changed or reinterpreted. In particular, a Legistar PassedFlag only says that the recorded procedural action succeeded. A recommendation that passed is not final approval of the underlying proposal.

For each input, return exactly one JSON object in outcomes with:
- id: copied exactly
- canonicalHeadline: copied exactly
- summary: one or two clear, direct sentences explaining what the body actually did and whether the action was final
- nextStep: a short source-supported next step, or null

Rewrite the official context instead of quoting it. Lead with the substantive decision in clear, direct language.
- Remove document boilerplate such as meeting titles, headers, footers, page numbers, and labels like "ACTION:".
- Rewrite procedural phrases such as "Motion and second (Name/Name), to ..." as a direct statement of what the body voted to do. Omit mover and seconder names unless they are necessary to understand the outcome.
- Repair obvious OCR word splits, but do not otherwise alter names or factual details.
- When a motion to recommend something passed, say that the body voted to recommend it; do not imply that the underlying proposal received final approval.
- Use a direct verb consistent with the canonical headline. For a passed motion, explicitly say that the body passed the motion or voted to take the stated action.

Use only facts present in the official context. Do not invent vote counts, dates, people, money, destinations, implementation details, or legal effect. Do not call an item approved, adopted, enacted, or finally passed unless its canonical status is approved. Return JSON only.`;

const OUTCOME_BOILERPLATE_PATTERN =
  /(?:\bpage\s+\d+\s+of\s+\d+\b|\b(?:action|result|decision)\s*:)/i;

function configuredProviders() {
  const providers: ExplanationProvider[] = [];
  const referer = getConfiguredAppUrl();
  const allCerebrasKeys = [
    process.env.CEREBRAS_API_KEY,
    process.env.CEREBRAS_API_KEY_2,
    process.env.CEREBRAS_API_KEY_3
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);
  const allOpenRouterKeys = [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);
  const rotateKeys = process.env.LLM_ENABLE_LEGACY_KEY_ROTATION === "true";
  const cerebrasKeys = rotateKeys ? allCerebrasKeys : allCerebrasKeys.slice(0, 1);
  const openRouterKeys = rotateKeys ? allOpenRouterKeys : allOpenRouterKeys.slice(0, 1);

  cerebrasKeys.forEach((apiKey, index) => {
    providers.push({
      label: cerebrasKeys.length > 1 ? `Cerebras key ${index + 1}` : "Cerebras",
      apiKey,
      baseUrl: "https://api.cerebras.ai/v1/chat/completions",
      model: process.env.CEREBRAS_MODEL || "gpt-oss-120b"
    });
  });
  openRouterKeys.forEach((apiKey, index) => {
    providers.push({
      label: openRouterKeys.length > 1 ? `OpenRouter key ${index + 1}` : "OpenRouter",
      apiKey,
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
      headers: {
        "HTTP-Referer": referer,
        "X-OpenRouter-Title": "SimpleCity"
      }
    });
  });
  const fallbackModel = process.env.OPENROUTER_FALLBACK_MODEL?.trim();
  const fallbackKey = process.env.OPENROUTER_FALLBACK_API_KEY || allOpenRouterKeys[0];
  if (fallbackModel && fallbackKey) {
    providers.push({
      label: "OpenRouter paid/BYOK fallback",
      apiKey: fallbackKey,
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      model: fallbackModel,
      headers: {
        "HTTP-Referer": referer,
        "X-OpenRouter-Title": "SimpleCity"
      }
    });
  }
  return providers;
}

export function hasDecisionOutcomeExplanationProvider() {
  return configuredProviders().length > 0;
}

function numericClaims(value: string) {
  return (value.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) || []).map((token) => {
    const unit = token.startsWith("$") ? "currency" : token.endsWith("%") ? "percent" : "plain";
    const number = token.replace(/[$,%]/g, "").replace(/^0+(?=\d)/, "");
    return `${unit}:${number}`;
  });
}

function hasOnlyGroundedNumbers(value: string, source: string) {
  const allowed = new Set(numericClaims(source));
  return numericClaims(value).every((claim) => allowed.has(claim));
}

function preservesCanonicalMeaning(
  input: DecisionOutcomeExplanationInput,
  explanation: DecisionOutcomeExplanation
) {
  const text = `${explanation.summary} ${explanation.nextStep || ""}`.toLowerCase();
  const claimsFinalApproval = /\b(?:approved|adopted|enacted|finally passed|received final approval)\b/.test(text);

  if (input.canonicalStatus !== "approved" && claimsFinalApproval) return false;
  if (input.canonicalStatus === "recommended") {
    return /\brecommend/.test(text) && /\b(?:board|next legislative|further action|not final)\b/.test(text);
  }
  if (input.canonicalStatus === "heard_and_filed") {
    return /\bheard\b/.test(text) && /\bfiled\b/.test(text);
  }
  if (input.canonicalStatus === "committee_action") {
    return /\bcommittee\b/.test(text) && /\b(?:board|further action|not final)\b/.test(text);
  }
  if (input.canonicalHeadline === "Amended in committee") {
    return /\bamend/.test(text) && /\bcommittee\b/.test(text);
  }
  if (input.canonicalStatus === "approved") return /\b(?:approved|adopted|passed|carried|authorized)\b/.test(text);
  if (input.canonicalStatus === "amended") return /\bamend/.test(text);
  if (input.canonicalStatus === "continued") return /\b(?:continued|postponed|deferred|returns?)\b/.test(text);
  if (input.canonicalStatus === "rejected") return /\b(?:rejected|denied|failed|defeated)\b/.test(text);
  if (input.canonicalStatus === "no_action") return /\bno action\b/.test(text);
  if (input.canonicalStatus === "direction") return /\bdirect/.test(text);
  return true;
}

export function validateDecisionOutcomeExplanation(
  input: DecisionOutcomeExplanationInput,
  candidate: {
    canonicalHeadline: string;
    summary: string;
    nextStep?: string | null;
  }
): DecisionOutcomeExplanation | null {
  if (candidate.canonicalHeadline !== input.canonicalHeadline) return null;
  const explanation = {
    summary: candidate.summary.trim(),
    nextStep: candidate.nextStep?.trim() || input.fallbackNextStep
  };
  if (OUTCOME_BOILERPLATE_PATTERN.test(explanation.summary)) return null;
  const groundingSource = [
    input.title,
    input.canonicalHeadline,
    input.fallbackSummary,
    input.fallbackNextStep,
    input.sourceContext
  ].filter(Boolean).join("\n");
  if (!hasOnlyGroundedNumbers(`${explanation.summary} ${explanation.nextStep || ""}`, groundingSource)) {
    return null;
  }
  return preservesCanonicalMeaning(input, explanation) ? explanation : null;
}

function promptForInputs(inputs: DecisionOutcomeExplanationInput[]) {
  return JSON.stringify({
    outcomes: inputs.map((input) => ({
      id: input.id,
      title: input.title,
      canonicalStatus: input.canonicalStatus,
      canonicalHeadline: input.canonicalHeadline,
      fallbackNextStep: input.fallbackNextStep,
      officialContext: input.sourceContext.slice(0, 3000)
    }))
  });
}

async function requestExplanations(
  provider: ExplanationProvider,
  inputs: DecisionOutcomeExplanationInput[],
  options: { log?: (message: string) => void; sleep?: (ms: number) => Promise<void> }
) {
  const prompt = promptForInputs(inputs);
  const maxCompletionTokens = positiveIntegerEnv("LLM_DECISION_MAX_COMPLETION_TOKENS", 2500);
  const providerName = provider.baseUrl.includes("cerebras.ai") ? "Cerebras" : "OpenRouter";
  const capacityKey = `${providerName}:${provider.model}`;
  await waitForLlmCapacity({
    capacityKey,
    label: provider.label,
    prompt: `${DECISION_OUTCOME_EXPLANATION_SYSTEM_PROMPT}\n${prompt}`,
    maxCompletionTokens,
    minIntervalMs: nonNegativeNumberEnv("DECISION_EXPLANATION_MIN_REQUEST_INTERVAL_MS", 5000),
    tokensPerMinute: nonNegativeNumberEnv(
      providerName === "Cerebras" ? "CEREBRAS_TOKENS_PER_MINUTE" : "OPENROUTER_TOKENS_PER_MINUTE",
      providerName === "Cerebras" ? 60_000 : 0
    ),
    sleep: options.sleep,
    log: options.log
  });

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
        { role: "system", content: DECISION_OUTCOME_EXPLANATION_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0,
      max_completion_tokens: maxCompletionTokens,
      response_format: { type: "json_object" }
    })
  }).finally(() => clearTimeout(timeout));
  observeLlmRateLimitHeaders(capacityKey, response.headers);

  if (!response.ok) {
    throw new Error(`${provider.label} decision explanation failed with ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = raw.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider.label} returned no decision explanation content.`);
  return ExplanationResponseSchema.parse(JSON.parse(jsonrepair(content)));
}

export async function generateDecisionOutcomeExplanations(
  inputs: DecisionOutcomeExplanationInput[],
  options: { log?: (message: string) => void; sleep?: (ms: number) => Promise<void> } = {}
) {
  if (inputs.length === 0) return new Map<string, DecisionOutcomeExplanation>();
  const providers = configuredProviders();
  if (providers.length === 0) throw new Error("No LLM provider is configured for decision explanations.");

  let lastError: unknown;
  const validated = new Map<string, DecisionOutcomeExplanation>();
  let pending = inputs;
  for (const provider of providers) {
    try {
      options.log?.(`Writing ${pending.length} grounded decision explanation(s) with ${provider.label}.`);
      const response = await requestExplanations(provider, pending, options);
      const candidates = new Map(response.outcomes.map((outcome) => [outcome.id, outcome]));
      for (const input of pending) {
        const candidate = candidates.get(input.id);
        if (!candidate) continue;
        const explanation = validateDecisionOutcomeExplanation(input, candidate);
        if (explanation) validated.set(input.id, explanation);
      }
      options.log?.(`Accepted ${validated.size} of ${inputs.length} grounded decision explanation(s).`);
      pending = inputs.filter((input) => !validated.has(input.id));
      if (pending.length === 0) return validated;
      lastError = new Error(`${provider.label} did not produce valid explanations for ${pending.length} outcome(s).`);
    } catch (error) {
      lastError = error;
      options.log?.(`${provider.label} decision explanation failed; trying the next provider.`);
    }
  }
  if (validated.size > 0) return validated;
  throw lastError instanceof Error ? lastError : new Error("Decision explanation generation failed.");
}
