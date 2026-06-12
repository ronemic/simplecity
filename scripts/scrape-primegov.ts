import "@/lib/env/bootstrap";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getJurisdictionDocumentsDir,
  getJurisdictionScrapedDir
} from "@/lib/scraper/downloadDocuments";
import { scrapeAllArchivePages, scrapePortal } from "@/lib/scraper/primegov";
import {
  getDefaultJurisdiction,
  getJurisdictionBySlug,
  requireValidJurisdictionSlug,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";

const SHOULD_DOWNLOAD = process.argv.includes("--download");
const SHOULD_SCRAPE_HTML_AGENDAS = process.argv.includes("--html");
const SCRAPE_ALL_YEARS = process.argv.includes("--all-years");
const HEADFUL = process.argv.includes("--headful");

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function getRequestedJurisdiction(): JurisdictionSlug {
  const raw = getArgValue("jurisdiction");
  if (!raw) return getDefaultJurisdiction().slug;
  const slug = requireValidJurisdictionSlug(raw);
  if (slug === "all") {
    throw new Error("Use a concrete jurisdiction with scrape-primegov.ts.");
  }
  return slug;
}

async function main() {
  const jurisdiction = getJurisdictionBySlug(getRequestedJurisdiction());
  if (!jurisdiction) throw new Error("Unknown jurisdiction.");
  if (jurisdiction.platform !== "primegov") {
    throw new Error(`${jurisdiction.name} is configured for ${jurisdiction.platform}, not PrimeGov.`);
  }

  const outputDir = getJurisdictionScrapedDir(jurisdiction.slug);
  const documentsDir = getJurisdictionDocumentsDir(jurisdiction.slug);
  const jsonOutput = path.join(outputDir, "meetings.json");

  await fs.mkdir(outputDir, { recursive: true });

  const result = SCRAPE_ALL_YEARS
    ? await scrapeAllArchivePages({
        portalUrl: jurisdiction.primegovUrl,
        headful: HEADFUL,
        downloadDocuments: SHOULD_DOWNLOAD,
        documentOutputDir: documentsDir,
        scrapeHtmlAgendas: SHOULD_SCRAPE_HTML_AGENDAS,
        allYears: true,
        log: console.log
      })
    : await scrapePortal({
        portalUrl: jurisdiction.primegovUrl,
        headful: HEADFUL,
        downloadDocuments: SHOULD_DOWNLOAD,
        documentOutputDir: documentsDir,
        scrapeHtmlAgendas: SHOULD_SCRAPE_HTML_AGENDAS,
        log: console.log
      });

  for (const meeting of result.meetings) {
    meeting.jurisdictionName = jurisdiction.name;
    meeting.jurisdictionSlug = jurisdiction.slug;
    meeting.platform = jurisdiction.platform;
    for (const doc of meeting.documents) {
      doc.jurisdictionName = jurisdiction.name;
      doc.jurisdictionSlug = jurisdiction.slug;
      doc.platform = jurisdiction.platform;
    }
  }

  await fs.writeFile(jsonOutput, JSON.stringify(result, null, 2));

  console.log(`Saved output to ${jsonOutput}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
