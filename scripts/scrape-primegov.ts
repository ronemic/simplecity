import fs from "node:fs/promises";
import path from "node:path";
import { SCRAPED_DIR } from "@/lib/scraper/downloadDocuments";
import { scrapeAllArchivePages, scrapePortal } from "@/lib/scraper/primegov";

const JSON_OUTPUT = path.join(SCRAPED_DIR, "meetings.json");

const SHOULD_DOWNLOAD = process.argv.includes("--download");
const SHOULD_SCRAPE_HTML_AGENDAS = process.argv.includes("--html");
const SCRAPE_ALL_YEARS = process.argv.includes("--all-years");
const HEADFUL = process.argv.includes("--headful");

async function main() {
  await fs.mkdir(SCRAPED_DIR, { recursive: true });

  const result = SCRAPE_ALL_YEARS
    ? await scrapeAllArchivePages({
        headful: HEADFUL,
        downloadDocuments: SHOULD_DOWNLOAD,
        scrapeHtmlAgendas: SHOULD_SCRAPE_HTML_AGENDAS,
        allYears: true,
        log: console.log
      })
    : await scrapePortal({
        headful: HEADFUL,
        downloadDocuments: SHOULD_DOWNLOAD,
        scrapeHtmlAgendas: SHOULD_SCRAPE_HTML_AGENDAS,
        log: console.log
      });

  await fs.writeFile(JSON_OUTPUT, JSON.stringify(result, null, 2));

  console.log(`Saved output to ${JSON_OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
