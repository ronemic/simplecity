import "@/lib/env/bootstrap";
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
import { publicErrorMessage, redactPublicLogMessage } from "@/lib/logging/publicLog";

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

function getLimit() {
  const raw = getArgValue("limit");
  if (!raw) return undefined;

  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("--limit must be a positive number.");
  }

  return Math.floor(limit);
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

function getMaxRuntimeMinutes() {
  const raw = getArgValue("max-runtime-minutes");
  if (!raw) return undefined;

  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("--max-runtime-minutes must be a positive number.");
  }

  return minutes;
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
    enrichAgendaAttachments: !process.argv.includes("--no-agenda-attachments"),
    enrichDetails: !process.argv.includes("--no-enrich"),
    clickSeeMore: process.argv.includes("--see-more"),
    limit: getLimit(),
    monthsBack: getNonNegativeInteger("months-back"),
    monthsForward: getNonNegativeInteger("months-forward"),
    allVisible: process.argv.includes("--all-visible"),
    body: getArgValue("body") || undefined,
    persist: !process.argv.includes("--no-persist"),
    summarize: !process.argv.includes("--no-summarize"),
    maxRuntimeMinutes: getMaxRuntimeMinutes(),
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
  console.log(redactPublicLogMessage(`Saved pipeline result to ${outputJson}`));

  if (result.status === "failed") process.exit(1);
  if (process.argv.includes("--require-results-coverage")) {
    const coverageErrors = result.errors.filter((error) =>
      /Outcome coverage incomplete|Decision outcome reconciliation failed|Minutes ingestion incomplete/i.test(error)
    );
    if (coverageErrors.length > 0) {
      console.error(
        `Results coverage gate failed with ${coverageErrors.length} ingestion or matching error(s).`
      );
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(publicErrorMessage(error, "Unknown pipeline error."));
  process.exit(1);
});
