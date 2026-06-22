import "@/lib/env/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getJurisdictionBySlug,
  requireValidJurisdictionSlug,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";
import {
  getJurisdictionDocumentsDir,
  getJurisdictionScrapedDir
} from "@/lib/scraper/downloadDocuments";
import { scrapeLegistarMeetings } from "@/lib/sources/legistar";

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function getRequestedJurisdiction(): JurisdictionSlug {
  const raw = getArgValue("jurisdiction") || "san-mateo-county";
  const slug = requireValidJurisdictionSlug(raw);
  if (slug === "all") {
    throw new Error("Use a concrete jurisdiction with scrape-legistar.ts.");
  }

  return slug;
}

function parsePositiveInteger(value: string | null) {
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer but received: ${value}`);
  }

  return parsed;
}

async function main() {
  const jurisdiction = getJurisdictionBySlug(getRequestedJurisdiction());
  if (!jurisdiction) throw new Error("Unknown jurisdiction.");
  if (jurisdiction.platform !== "legistar") {
    throw new Error(`${jurisdiction.name} is configured for ${jurisdiction.platform}, not Legistar.`);
  }

  const outputDir = getJurisdictionScrapedDir(jurisdiction.slug);
  const documentsDir = getJurisdictionDocumentsDir(jurisdiction.slug);
  await fs.mkdir(outputDir, { recursive: true });

  const result = await scrapeLegistarMeetings({
    jurisdiction,
    portalUrl: jurisdiction.legistarUrl || jurisdiction.sourceUrl,
    documentOutputDir: documentsDir,
    headful: process.argv.includes("--headful"),
    downloadDocuments: process.argv.includes("--download"),
    enrichDetails: !process.argv.includes("--no-details"),
    enrichLegislation: process.argv.includes("--legislation"),
    limit: parsePositiveInteger(getArgValue("limit")),
    maxItemsPerMeeting: parsePositiveInteger(getArgValue("max-items-per-meeting")),
    log: console.log
  });

  const outputJson = path.join(outputDir, "meetings.json");
  await fs.writeFile(outputJson, JSON.stringify(result, null, 2), "utf8");

  console.log(`Saved ${result.totalMeetingCount} Legistar meetings to ${outputJson}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
