import "@/lib/env/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getJurisdictionDocumentsDir,
  getJurisdictionScrapedDir
} from "@/lib/scraper/downloadDocuments";
import {
  getJurisdictionBySlug,
  requireValidJurisdictionSlug,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";
import { scrapeIqm2Meetings } from "@/lib/sources/iqm2";

const SHOULD_DOWNLOAD = process.argv.includes("--download");
const HEADFUL = process.argv.includes("--headful");
const CLICK_SEE_MORE = process.argv.includes("--see-more");
const SKIP_DETAIL_ENRICHMENT = process.argv.includes("--no-enrich");

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function getLimit() {
  const raw = getArgValue("limit");
  if (!raw) return undefined;

  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("--limit must be a positive number.");
  }

  return Math.floor(limit);
}

function getRequestedJurisdiction(): JurisdictionSlug {
  const raw = getArgValue("jurisdiction") || "santa-clara-county";
  const slug = requireValidJurisdictionSlug(raw);
  if (slug === "all") {
    throw new Error("Use a concrete jurisdiction with scrape-iqm2.ts.");
  }
  return slug;
}

async function main() {
  const jurisdiction = getJurisdictionBySlug(getRequestedJurisdiction());
  if (!jurisdiction) throw new Error("Unknown jurisdiction.");
  if (jurisdiction.platform !== "iqm2") {
    throw new Error(`${jurisdiction.name} is configured for ${jurisdiction.platform}, not IQM2.`);
  }

  const outputDir = getJurisdictionScrapedDir(jurisdiction.slug);
  const documentsDir = getJurisdictionDocumentsDir(jurisdiction.slug);
  const jsonOutput = path.join(outputDir, "meetings.json");

  await fs.mkdir(outputDir, { recursive: true });

  const result = await scrapeIqm2Meetings({
    jurisdiction,
    portalUrl: jurisdiction.iqm2Url || jurisdiction.sourceUrl,
    headful: HEADFUL,
    clickSeeMore: CLICK_SEE_MORE,
    enrichDetails: !SKIP_DETAIL_ENRICHMENT,
    downloadDocuments: SHOULD_DOWNLOAD,
    documentOutputDir: documentsDir,
    limit: getLimit(),
    log: console.log
  });

  await fs.writeFile(jsonOutput, JSON.stringify(result, null, 2));

  console.log(`Saved output to ${jsonOutput}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
