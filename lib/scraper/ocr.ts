import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { hasUsableOfficialDocumentText } from "@/lib/scraper/documentUsability";
import { cleanPdfText, isLikelyReadablePdfText } from "@/lib/scraper/pdfText";
import type { PrimeGovDocument } from "@/lib/types";

const run = promisify(execFile);

const OCR_DOCUMENT_TYPES = new Set(["Minutes", "Accessible Minutes"]);
const MAX_OCR_PAGES = 60;
const RENDER_TIMEOUT_MS = 180_000;
const PAGE_TIMEOUT_MS = 90_000;
const MIN_OCR_CHARACTERS = 200;

let toolsAvailable: Promise<boolean> | null = null;

function runningLineKey(line: string) {
  return line.replace(/\s+\d{1,3}\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

const PAGE_EDGE_LINES = 3;

function edgeLineIndexes(lines: string[]) {
  const nonEmpty = lines.flatMap((line, index) => (line.trim() ? [index] : []));
  return new Set([
    ...nonEmpty.slice(0, PAGE_EDGE_LINES),
    ...nonEmpty.slice(-PAGE_EDGE_LINES)
  ]);
}

/**
 * OCR reads page furniture as body text. LASD stamps every page with a footer
 * and page number ("Minutes are DRAFT ... September 14, 2026 4"), which lands
 * mid-sentence when a vote spans a page break. Drop header/footer lines that
 * repeat across most pages, and bare page numbers. Only the first and last few
 * lines of a page are considered, so repeated body lines such as "Voting
 * results: Unanimously approved" are kept.
 */
export function stripRunningPageLines(pages: string[]) {
  const pageLines = pages.map((page) => page.split("\n"));
  const pageCounts = new Map<string, number>();
  for (const lines of pageLines) {
    const keys = new Set(
      [...edgeLineIndexes(lines)].map((index) => runningLineKey(lines[index])).filter((key) => key.length >= 12)
    );
    for (const key of keys) pageCounts.set(key, (pageCounts.get(key) || 0) + 1);
  }
  // Real page furniture is on (nearly) every page; a body line that happens to
  // start several pages must not qualify.
  const minimumPages = Math.max(3, Math.ceil(pages.length * 0.8));
  return pageLines.map((lines) => {
    const edges = edgeLineIndexes(lines);
    return lines
      .filter((line, index) => {
        if (!edges.has(index)) return true;
        if (/^\s*(?:page\s+)?\d{1,3}(?:\s+of\s+\d{1,3})?\s*$/i.test(line)) return false;
        return (pageCounts.get(runningLineKey(line)) || 0) < minimumPages;
      })
      .join("\n");
  });
}

function ocrToolsAvailable() {
  toolsAvailable ??= Promise.all([
    run("gs", ["--version"], { timeout: 10_000 }),
    run("tesseract", ["--version"], { timeout: 10_000 })
  ]).then(() => true, () => false);
  return toolsAvailable;
}

/**
 * Some bodies (Los Altos School District) publish minutes as scanned images,
 * so the PDF has no text layer. Render each page with Ghostscript and read it
 * with tesseract. Returns null when the scan yields no readable text.
 */
export async function ocrPdfText(localPath: string, maxPages = MAX_OCR_PAGES) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-ocr-"));
  try {
    await run(
      "gs",
      [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-dSAFER",
        "-sDEVICE=pnggray",
        "-r300",
        "-dFirstPage=1",
        `-dLastPage=${maxPages}`,
        `-sOutputFile=${path.join(workDir, "page-%03d.png")}`,
        localPath
      ],
      { timeout: RENDER_TIMEOUT_MS }
    );
    const pages = (await fs.readdir(workDir)).filter((name) => name.endsWith(".png")).sort();
    const texts: string[] = [];
    for (const page of pages) {
      const { stdout } = await run("tesseract", [path.join(workDir, page), "-"], {
        timeout: PAGE_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024
      });
      texts.push(stdout);
    }
    const text = cleanPdfText(stripRunningPageLines(texts).join("\n\n"));
    if (text.length < MIN_OCR_CHARACTERS || !isLikelyReadablePdfText(text)) return null;
    return { pages: pages.length, text };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

/**
 * OCR downloaded minutes PDFs that have no usable text layer. Run this after
 * archived extractions are restored so each scan is read once, not every run.
 */
export async function ocrScannedMinutesForMeetings(
  meetings: { documents: PrimeGovDocument[] }[],
  options: { log?: (message: string) => void; shouldStop?: () => boolean } = {}
) {
  const log = options.log || (() => undefined);
  const candidates = meetings.flatMap((meeting) =>
    meeting.documents.filter(
      (document) =>
        OCR_DOCUMENT_TYPES.has(document.type) &&
        document.isScanned &&
        !document.downloadError &&
        /\.pdf$/i.test(document.localPath || "") &&
        !hasUsableOfficialDocumentText(document)
    )
  );
  if (candidates.length === 0) return 0;
  if (!(await ocrToolsAvailable())) {
    log(`Skipping OCR for ${candidates.length} scanned minutes document(s): Ghostscript and tesseract are not installed.`);
    return 0;
  }

  const results = new Map<string, Awaited<ReturnType<typeof ocrPdfText>>>();
  let recovered = 0;
  for (const document of candidates) {
    if (options.shouldStop?.()) break;
    const localPath = document.localPath as string;
    if (!results.has(localPath)) {
      try {
        results.set(localPath, await ocrPdfText(localPath));
      } catch (error) {
        log(`OCR failed for ${document.url}: ${error instanceof Error ? error.message : "Unknown OCR error"}`);
        results.set(localPath, null);
      }
    }
    const result = results.get(localPath);
    if (!result) continue;
    document.extractedText = result.text;
    document.extractionCharacterCount = result.text.length;
    document.isScanned = false;
    recovered += 1;
    log(`OCR read ${result.text.length} characters from ${result.pages} page(s) of ${document.url}.`);
  }
  return recovered;
}
