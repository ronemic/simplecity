import fs from "node:fs/promises";
import path from "node:path";
import type { ScrapePortalResult } from "@/lib/types";
import { SCRAPED_DIR, getJurisdictionScrapedDir } from "@/lib/scraper/downloadDocuments";
import { prepareLlmInput } from "@/lib/scraper/prepareLlmInput";
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
    throw new Error("Use a concrete jurisdiction with prepare-llm-input.ts.");
  }
  return slug;
}

async function readMeetingsJson(
  meetingsJson: string,
  legacyMeetingsJson: string,
  allowLegacyFallback: boolean
) {
  try {
    return await fs.readFile(meetingsJson, "utf8");
  } catch (error) {
    if (allowLegacyFallback && meetingsJson !== legacyMeetingsJson) {
      return fs.readFile(legacyMeetingsJson, "utf8");
    }
    throw error;
  }
}

async function main() {
  const jurisdictionSlug = getRequestedJurisdiction();
  const outputDir = getJurisdictionScrapedDir(jurisdictionSlug);
  const meetingsJson = path.join(outputDir, "meetings.json");
  const legacyMeetingsJson = path.join(SCRAPED_DIR, "meetings.json");
  const outputJson = path.join(outputDir, "llm-ready-meetings.json");

  await fs.mkdir(outputDir, { recursive: true });

  const raw = JSON.parse(
    await readMeetingsJson(meetingsJson, legacyMeetingsJson, jurisdictionSlug === "foster-city")
  ) as ScrapePortalResult;
  const llmReadyMeetings = [];

  for (const meeting of raw.meetings) {
    console.log(`Preparing: ${meeting.title} - ${meeting.dateText || "No date"}`);
    const [prepared] = await prepareLlmInput([meeting]);
    llmReadyMeetings.push(prepared);
  }

  const result = {
    source: raw.source,
    scrapedAt: raw.scrapedAt,
    preparedAt: new Date().toISOString(),
    meetingCount: llmReadyMeetings.length,
    meetings: llmReadyMeetings
  };

  await fs.writeFile(outputJson, JSON.stringify(result, null, 2));

  console.log(`Saved LLM-ready file to: ${outputJson}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
