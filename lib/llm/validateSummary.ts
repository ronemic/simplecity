import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import { CATEGORIES } from "@/lib/constants";
import type { SimpleCitySummary } from "@/lib/types";

const allowedCategories = new Set<string>(CATEGORIES);

const CardSchema = z.object({
  agendaItem: z.string().min(1),
  whatIsHappening: z.string().min(1),
  whyItMatters: z.string().min(1),
  whoItAffects: z.array(z.string()).default([]),
  categoryTags: z.array(z.string()).default([]),
  status: z.string().min(1),
  commentWindow: z
    .object({
      opens: z.string().default("Not listed in the source document."),
      closes: z.string().default("Not listed in the source document.")
    })
    .default({
      opens: "Not listed in the source document.",
      closes: "Not listed in the source document."
    }),
  howToAct: z
    .object({
      attend: z.string().default("Not listed in the source document."),
      email: z.string().default("Not listed in the source document."),
      submitComment: z.string().default("Not listed in the source document.")
    })
    .default({
      attend: "Not listed in the source document.",
      email: "Not listed in the source document.",
      submitComment: "Not listed in the source document."
    }),
  source: z.string().default(""),
  confidence: z.enum(["high", "medium", "low"]).default("medium")
});

const SummarySchema = z.object({
  meetingSummary: z.object({
    title: z.string().default(""),
    date: z.string().default(""),
    status: z.string().default(""),
    oneSentenceSummary: z.string().default("")
  }),
  cards: z.array(CardSchema).default([])
});

export function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");

  if (first === -1 || last === -1 || last <= first) {
    throw new Error("LLM response did not contain a JSON object.");
  }

  return trimmed.slice(first, last + 1);
}

export function parsePossiblyWrappedJson(raw: string) {
  const json = extractJsonObject(raw);

  try {
    return JSON.parse(json) as unknown;
  } catch (error) {
    const repaired = jsonrepair(json);
    return JSON.parse(repaired) as unknown;
  }
}

export function validateSimpleCitySummary(raw: unknown, fallbackSource = ""): SimpleCitySummary {
  const parsed = SummarySchema.parse(raw);

  const cards = parsed.cards
    .map((card) => ({
      ...card,
      agendaItem: card.agendaItem.trim(),
      whatIsHappening: card.whatIsHappening.trim(),
      whyItMatters: card.whyItMatters.trim(),
      whoItAffects: card.whoItAffects.map((item) => item.trim()).filter(Boolean),
      categoryTags: card.categoryTags
        .map((tag) => tag.trim())
        .filter((tag) => allowedCategories.has(tag)),
      source: card.source.trim() || fallbackSource
    }))
    .filter(
      (card) =>
        card.source &&
        card.whatIsHappening &&
        card.agendaItem &&
        card.whyItMatters &&
        card.categoryTags.length > 0
    );

  return {
    meetingSummary: parsed.meetingSummary,
    cards
  };
}

export function parseAndValidateSummary(rawContent: string, fallbackSource = "") {
  const parsed = parsePossiblyWrappedJson(rawContent);
  return validateSimpleCitySummary(parsed, fallbackSource);
}
