import "@/lib/env/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getJurisdictionDocumentsDir,
  getJurisdictionScrapedDir
} from "@/lib/scraper/downloadDocuments";
import {
  getDefaultJurisdiction,
  getJurisdictionBySlug,
  requireValidJurisdictionSlug,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";
import { scrapeEscribeMeetings } from "@/lib/sources/escribe";

const SHOULD_DOWNLOAD = process.argv.includes("--download");
const HEADFUL = process.argv.includes("--headful");

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function getRequestedJurisdiction(): JurisdictionSlug {
  const raw = getArgValue("jurisdiction");
  if (!raw) return getDefaultJurisdiction().slug;
  const slug = requireValidJurisdictionSlug(raw);
  if (slug === "all") throw new Error("Use a concrete jurisdiction with scrape-escribe.ts.");
  return slug;
}

function getLimit() {
  const raw = getArgValue("limit");
  if (!raw) return undefined;
  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit <= 0) throw new Error("--limit must be a positive number.");
  return Math.floor(limit);
}

async function main() {
  const jurisdiction = getJurisdictionBySlug(getRequestedJurisdiction());
  if (!jurisdiction) throw new Error("Unknown jurisdiction.");
  if (jurisdiction.platform !== "escribe" || !jurisdiction.escribeUrl) {
    throw new Error(`${jurisdiction.name} is not configured for eSCRIBE.`);
  }

  const outputDir = getJurisdictionScrapedDir(jurisdiction.slug);
  const documentsDir = getJurisdictionDocumentsDir(jurisdiction.slug);
  await fs.mkdir(outputDir, { recursive: true });
  const result = await scrapeEscribeMeetings({
    jurisdiction,
    portalUrl: jurisdiction.escribeUrl,
    headful: HEADFUL,
    downloadDocuments: SHOULD_DOWNLOAD,
    documentOutputDir: documentsDir,
    scrapeHtmlAgendas: true,
    limit: getLimit(),
    log: console.log
  });

  const outputPath = path.join(outputDir, "meetings.json");
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(`Saved output to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
