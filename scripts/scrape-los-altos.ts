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
import { scrapeCivicClerkMeetings } from "@/lib/sources/civicclerk";

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function positiveInteger(name: string, fallback?: number) {
  const value = arg(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer.`);
  }
  return parsed;
}

function requestedJurisdiction(): JurisdictionSlug {
  const slug = requireValidJurisdictionSlug(arg("jurisdiction") || "los-altos");
  if (slug === "all") throw new Error("Use a concrete jurisdiction with scrape-los-altos.ts.");
  return slug;
}

async function main() {
  const jurisdiction = getJurisdictionBySlug(requestedJurisdiction());
  if (!jurisdiction) throw new Error("Unknown jurisdiction.");
  if (jurisdiction.slug !== "los-altos" || jurisdiction.platform !== "civicclerk") {
    throw new Error(`${jurisdiction.name} is configured for ${jurisdiction.platform}, not Los Altos CivicClerk.`);
  }

  const outputDir = getJurisdictionScrapedDir(jurisdiction.slug);
  const documentsDir = getJurisdictionDocumentsDir(jurisdiction.slug);
  await fs.mkdir(outputDir, { recursive: true });

  const result = await scrapeCivicClerkMeetings({
    jurisdiction,
    portalUrl: jurisdiction.civicClerkUrl || jurisdiction.sourceUrl,
    headful: process.argv.includes("--headful"),
    downloadDocuments: process.argv.includes("--download"),
    documentOutputDir: documentsDir,
    limit: positiveInteger("limit"),
    monthsBack: positiveInteger("months-back", 1),
    monthsForward: positiveInteger("months-forward", 1),
    allVisible: process.argv.includes("--all-visible"),
    body: arg("body") || undefined,
    log: console.log
  });

  const outputJson = path.join(outputDir, "meetings.json");
  await fs.writeFile(outputJson, JSON.stringify(result, null, 2), "utf8");
  console.log(`Saved ${result.totalMeetingCount} Los Altos meetings to ${outputJson}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
