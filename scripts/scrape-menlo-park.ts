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
import { scrapeMenloParkMeetings } from "@/lib/sources/menlo-park";

const SHOULD_DOWNLOAD = process.argv.includes("--download");
const HEADFUL = process.argv.includes("--headful");
const SCRAPE_ALL_YEARS = process.argv.includes("--all-years");

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function getRequestedJurisdiction(): JurisdictionSlug {
  const raw = getArgValue("jurisdiction") || "menlo-park";
  const slug = requireValidJurisdictionSlug(raw);
  if (slug === "all") {
    throw new Error("Use a concrete jurisdiction with scrape-menlo-park.ts.");
  }
  return slug;
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

function getYear() {
  const raw = getArgValue("year");
  if (!raw) return undefined;

  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("--year must be a four-digit year.");
  }

  return year;
}

function getNonNegativeInteger(name: string) {
  const raw = getArgValue(name);
  if (!raw) return undefined;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer.`);
  }

  return value;
}

async function main() {
  const jurisdiction = getJurisdictionBySlug(getRequestedJurisdiction());
  if (!jurisdiction) throw new Error("Unknown jurisdiction.");
  if (jurisdiction.platform !== "official-site" || jurisdiction.slug !== "menlo-park") {
    throw new Error(`${jurisdiction.name} is configured for ${jurisdiction.platform}, not Menlo Park official-site scraping.`);
  }

  const outputDir = getJurisdictionScrapedDir(jurisdiction.slug);
  const documentsDir = getJurisdictionDocumentsDir(jurisdiction.slug);
  const jsonOutput = path.join(outputDir, "meetings.json");

  await fs.mkdir(outputDir, { recursive: true });

  const result = await scrapeMenloParkMeetings({
    jurisdiction,
    portalUrl: jurisdiction.officialSiteUrl || jurisdiction.sourceUrl,
    headful: HEADFUL,
    downloadDocuments: SHOULD_DOWNLOAD,
    enrichAgendaAttachments: !process.argv.includes("--no-agenda-attachments"),
    documentOutputDir: documentsDir,
    allYears: SCRAPE_ALL_YEARS,
    allVisible: process.argv.includes("--all-visible"),
    monthsBack: getNonNegativeInteger("months-back"),
    monthsForward: getNonNegativeInteger("months-forward"),
    year: getYear(),
    body: getArgValue("body") || undefined,
    limit: getLimit(),
    log: console.log
  });

  await fs.writeFile(jsonOutput, JSON.stringify(result, null, 2));

  console.log(`Saved ${result.totalMeetingCount} Menlo Park meetings to ${jsonOutput}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
