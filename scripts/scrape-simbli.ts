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
import { scrapeSimbliMeetings } from "@/lib/sources/simbli";

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function nonNegativeInteger(name: string, fallback?: number) {
  const value = arg(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer.`);
  }
  return parsed;
}

function requestedJurisdiction(): JurisdictionSlug {
  const slug = requireValidJurisdictionSlug(
    arg("jurisdiction") || "los-altos-school-district"
  );
  if (slug === "all") throw new Error("Use a concrete jurisdiction with scrape-simbli.ts.");
  return slug;
}

async function main() {
  const jurisdiction = getJurisdictionBySlug(requestedJurisdiction());
  if (!jurisdiction) throw new Error("Unknown jurisdiction.");
  if (jurisdiction.platform !== "simbli") {
    throw new Error(`${jurisdiction.name} is configured for ${jurisdiction.platform}, not Simbli.`);
  }

  const outputDir = getJurisdictionScrapedDir(jurisdiction.slug);
  const documentsDir = getJurisdictionDocumentsDir(jurisdiction.slug);
  await fs.mkdir(outputDir, { recursive: true });

  const result = await scrapeSimbliMeetings({
    jurisdiction,
    portalUrl: jurisdiction.simbliUrl || jurisdiction.sourceUrl,
    headful: process.argv.includes("--headful"),
    downloadDocuments: process.argv.includes("--download"),
    documentOutputDir: documentsDir,
    limit: nonNegativeInteger("limit"),
    monthsBack: nonNegativeInteger("months-back", 1),
    monthsForward: nonNegativeInteger("months-forward", 1),
    allVisible: process.argv.includes("--all-visible"),
    body: arg("body") || undefined,
    requestCap: nonNegativeInteger("request-cap"),
    log: console.log
  });

  const outputJson = path.join(outputDir, "meetings.json");
  await fs.writeFile(outputJson, JSON.stringify(result, null, 2), "utf8");
  console.log(`Saved ${result.totalMeetingCount} ${jurisdiction.name} meetings to ${outputJson}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
