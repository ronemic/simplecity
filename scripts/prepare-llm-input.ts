import fs from "node:fs/promises";
import path from "node:path";
import type { ScrapePortalResult } from "@/lib/types";
import { SCRAPED_DIR } from "@/lib/scraper/downloadDocuments";
import { prepareLlmInput } from "@/lib/scraper/prepareLlmInput";

const MEETINGS_JSON = path.join(SCRAPED_DIR, "meetings.json");
const OUTPUT_JSON = path.join(SCRAPED_DIR, "llm-ready-meetings.json");

async function main() {
  const raw = JSON.parse(await fs.readFile(MEETINGS_JSON, "utf8")) as ScrapePortalResult;
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

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(result, null, 2));

  console.log(`Saved LLM-ready file to: ${OUTPUT_JSON}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
