import fs from "node:fs/promises";
import path from "node:path";
import { runSimpleCityPipeline } from "@/lib/pipeline";
import { SCRAPED_DIR } from "@/lib/scraper/downloadDocuments";

const OUTPUT_JSON = path.join(SCRAPED_DIR, "pipeline-result.json");

async function main() {
  await fs.mkdir(SCRAPED_DIR, { recursive: true });

  const result = await runSimpleCityPipeline({
    headful: process.argv.includes("--headful"),
    scrapeHtmlAgendas: true,
    downloadDocuments: true,
    persist: !process.argv.includes("--no-persist"),
    summarize: !process.argv.includes("--no-summarize"),
    log: console.log
  });

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(result, null, 2));
  console.log(`Saved pipeline result to ${OUTPUT_JSON}`);

  if (result.status === "failed") process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
