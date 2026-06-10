import "@/lib/env/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import type { LlmReadyMeeting } from "@/lib/types";
import { generateSummaryForMeeting } from "@/lib/llm/openrouter";
import { SCRAPED_DIR, getJurisdictionScrapedDir } from "@/lib/scraper/downloadDocuments";
import {
  getDefaultJurisdiction,
  requireValidJurisdictionSlug,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function getRequestedJurisdiction(): JurisdictionSlug {
  const raw = getArgValue("jurisdiction");
  if (!raw) return getDefaultJurisdiction().slug;
  const slug = requireValidJurisdictionSlug(raw);
  if (slug === "all") {
    throw new Error("Use a concrete jurisdiction with generate-simplecity-cards.ts.");
  }
  return slug;
}

async function readInputJson(inputJson: string, legacyInputJson: string, allowLegacyFallback: boolean) {
  try {
    return await fs.readFile(inputJson, "utf8");
  } catch (error) {
    if (allowLegacyFallback && inputJson !== legacyInputJson) {
      return fs.readFile(legacyInputJson, "utf8");
    }
    throw error;
  }
}

async function main() {
  const jurisdictionSlug = getRequestedJurisdiction();
  const outputDir = getJurisdictionScrapedDir(jurisdictionSlug);
  const inputJson = path.join(outputDir, "llm-ready-meetings.json");
  const legacyInputJson = path.join(SCRAPED_DIR, "llm-ready-meetings.json");
  const outputJson = path.join(outputDir, "simplecity-summaries.json");

  await fs.mkdir(outputDir, { recursive: true });

  const raw = JSON.parse(
    await readInputJson(inputJson, legacyInputJson, jurisdictionSlug === "foster-city")
  ) as {
    meetings: LlmReadyMeeting[];
  };

  const summaries = [];

  for (const meeting of raw.meetings) {
    if (!meeting.llmInputText) {
      console.log(`Skipping ${meeting.title}; no LLM input text.`);
      continue;
    }

    console.log(`Summarizing: ${meeting.title} - ${meeting.dateText || "No date"}`);
    try {
      const result = await generateSummaryForMeeting(meeting, { log: console.log });
      summaries.push({
        meetingId: meeting.id,
        title: meeting.title,
        dateText: meeting.dateText,
        sourceUrl: meeting.sourceUrl,
        summary: result.summary,
        raw: result.raw
      });
    } catch (error) {
      summaries.push({
        meetingId: meeting.id,
        title: meeting.title,
        error: error instanceof Error ? error.message : "Unknown LLM error"
      });
    }
  }

  await fs.writeFile(
    outputJson,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summaries
      },
      null,
      2
    )
  );

  console.log(`Saved summaries to ${outputJson}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
