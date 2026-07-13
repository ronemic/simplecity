import "@/lib/env/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import { getJurisdictionBySlug, requireValidJurisdictionSlug } from "@/lib/config/jurisdictions";
import { getJurisdictionDocumentsDir, getJurisdictionScrapedDir } from "@/lib/scraper/downloadDocuments";
import { scrapeEastPaloAltoMeetings } from "@/lib/sources/east-palo-alto";

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function positiveNumber(name: string) {
  const value = arg(name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${name} must be a positive number.`);
  return Math.floor(parsed);
}

async function main() {
  const slug = requireValidJurisdictionSlug(arg("jurisdiction") || "east-palo-alto");
  if (slug !== "east-palo-alto") throw new Error("This scraper only supports east-palo-alto.");
  const jurisdiction = getJurisdictionBySlug(slug);
  if (!jurisdiction) throw new Error("East Palo Alto jurisdiction configuration is missing.");
  const outputDir = getJurisdictionScrapedDir(slug);
  await fs.mkdir(outputDir, { recursive: true });
  const result = await scrapeEastPaloAltoMeetings({
    jurisdiction,
    portalUrl: jurisdiction.officialSiteUrl || jurisdiction.sourceUrl,
    headful: process.argv.includes("--headful"),
    downloadDocuments: process.argv.includes("--download"),
    documentOutputDir: getJurisdictionDocumentsDir(slug),
    allVisible: process.argv.includes("--all-visible"),
    monthsBack: positiveNumber("months-back"),
    monthsForward: positiveNumber("months-forward"),
    body: arg("body") || undefined,
    limit: positiveNumber("limit"),
    log: console.log
  });
  const target = path.join(outputDir, "meetings.json");
  await fs.writeFile(target, JSON.stringify(result, null, 2));
  console.log(`Saved ${result.totalMeetingCount} East Palo Alto meetings to ${target}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
