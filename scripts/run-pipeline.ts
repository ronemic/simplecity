import fs from "node:fs/promises";
import path from "node:path";
import { runJurisdictionPipelines, runSimpleCityPipeline } from "@/lib/pipeline";
import { SCRAPED_DIR, getJurisdictionScrapedDir } from "@/lib/scraper/downloadDocuments";
import {
  ALL_JURISDICTIONS_SLUG,
  getDefaultJurisdiction,
  requireValidJurisdictionSlug,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function getRequestedJurisdiction(): JurisdictionSelection {
  const raw = getArgValue("jurisdiction");
  if (!raw) return getDefaultJurisdiction().slug;
  return requireValidJurisdictionSlug(raw);
}

async function main() {
  const jurisdiction = getRequestedJurisdiction();
  const outputDir =
    jurisdiction === ALL_JURISDICTIONS_SLUG
      ? path.join(SCRAPED_DIR, ALL_JURISDICTIONS_SLUG)
      : getJurisdictionScrapedDir(jurisdiction);
  const outputJson = path.join(outputDir, "pipeline-result.json");

  await fs.mkdir(outputDir, { recursive: true });

  const sharedOptions = {
    headful: process.argv.includes("--headful"),
    scrapeHtmlAgendas: true,
    downloadDocuments: true,
    persist: !process.argv.includes("--no-persist"),
    summarize: !process.argv.includes("--no-summarize"),
    log: console.log
  };

  const result =
    jurisdiction === ALL_JURISDICTIONS_SLUG
      ? await runJurisdictionPipelines(jurisdiction, sharedOptions)
      : await runSimpleCityPipeline({
          ...sharedOptions,
          jurisdiction
        });

  await fs.writeFile(outputJson, JSON.stringify(result, null, 2));
  console.log(`Saved pipeline result to ${outputJson}`);

  if (result.status === "failed") process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
