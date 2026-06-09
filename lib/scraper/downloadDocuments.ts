import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright";
import type { PrimeGovMeeting } from "@/lib/types";
import { buildDownloadFilename } from "./primegov";

export const SCRAPED_DIR = path.join(process.cwd(), "scraped-primegov");
export const DOCUMENTS_DIR = path.join(SCRAPED_DIR, "documents");

export type DownloadDocumentsOptions = {
  outputDir?: string;
  log?: (message: string) => void;
};

export async function downloadCompiledDocuments(
  context: BrowserContext,
  meetings: PrimeGovMeeting[],
  options: DownloadDocumentsOptions = {}
) {
  const docsDir = options.outputDir || DOCUMENTS_DIR;
  const log = options.log || (() => undefined);
  let downloaded = 0;
  let failed = 0;

  await fs.mkdir(docsDir, { recursive: true });

  for (const meeting of meetings) {
    const compiledDocs = meeting.documents.filter((doc) =>
      doc.url.includes("/Public/CompiledDocument")
    );

    for (const doc of compiledDocs) {
      const filename = buildDownloadFilename(meeting, doc.type, doc.url);
      const filePath = path.join(docsDir, `${filename}.pdf`);

      try {
        const response = await context.request.get(doc.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 SimpleCity civic agenda scraper"
          },
          timeout: 60000
        });

        if (!response.ok()) {
          failed += 1;
          doc.localPath = null;
          doc.downloadError = `HTTP ${response.status()}`;
          log(`Failed download ${doc.url}: ${response.status()}`);
          continue;
        }

        const buffer = await response.body();
        const firstBytes = buffer.subarray(0, 5).toString();

        if (firstBytes !== "%PDF-") {
          const errorPath = filePath.replace(".pdf", ".error.html");
          await fs.writeFile(errorPath, buffer);

          failed += 1;
          doc.localPath = null;
          doc.downloadError = `Downloaded file was not a PDF. Saved response to ${errorPath}`;

          log(`Not a PDF: ${doc.url}`);
          continue;
        }

        await fs.writeFile(filePath, buffer);

        downloaded += 1;
        doc.localPath = filePath;
        doc.bytes = buffer.length;
        doc.downloadError = null;

        log(`Downloaded: ${filePath}`);
      } catch (error) {
        failed += 1;
        doc.localPath = null;
        doc.downloadError = error instanceof Error ? error.message : "Unknown download error";
        log(`Download error for ${doc.url}: ${doc.downloadError}`);
      }
    }
  }

  return { downloaded, failed };
}
