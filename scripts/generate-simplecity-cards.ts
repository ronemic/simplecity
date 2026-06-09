import fs from "node:fs/promises";
import path from "node:path";
import type { LlmReadyMeeting } from "@/lib/types";
import { generateSummaryForMeeting } from "@/lib/llm/openrouter";
import { SCRAPED_DIR } from "@/lib/scraper/downloadDocuments";

const INPUT_JSON = path.join(SCRAPED_DIR, "llm-ready-meetings.json");
const OUTPUT_JSON = path.join(SCRAPED_DIR, "simplecity-summaries.json");

async function main() {
  const raw = JSON.parse(await fs.readFile(INPUT_JSON, "utf8")) as {
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
    OUTPUT_JSON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summaries
      },
      null,
      2
    )
  );

  console.log(`Saved summaries to ${OUTPUT_JSON}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
