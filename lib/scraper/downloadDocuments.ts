import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright";
import type { PrimeGovDocument, PrimeGovMeeting } from "@/lib/types";
import { buildDownloadFilename } from "./primegov";
import { slugify } from "@/lib/utils/slug";

export const SCRAPED_DIR = path.join(process.cwd(), "scraped-primegov");
export const DOCUMENTS_DIR = path.join(SCRAPED_DIR, "documents");

export function getJurisdictionScrapedDir(jurisdictionSlug: string) {
  return path.join(SCRAPED_DIR, jurisdictionSlug);
}

export function getJurisdictionDocumentsDir(jurisdictionSlug: string) {
  return path.join(getJurisdictionScrapedDir(jurisdictionSlug), "documents");
}

export type DownloadDocumentsOptions = {
  outputDir?: string;
  log?: (message: string) => void;
  shouldStop?: () => boolean;
};

function decodeBasicHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html: string) {
  return decodeBasicHtmlEntities(
    html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|td|th|h1|h2|h3|h4|h5|h6)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isIqm2ErrorHtml(text: string) {
  return /oops\.\. an error occurred|oops\.\. an error occured|a problem has occurred on this web site|error message:/i.test(
    text
  );
}

function iqm2DocumentFilename(meeting: PrimeGovMeeting, docType: string, sourceUrl: string) {
  let documentId = "unknown-id";

  try {
    const parsed = new URL(sourceUrl);
    documentId =
      parsed.searchParams.get("FileID") ||
      parsed.searchParams.get("ID") ||
      parsed.searchParams.get("MeetingID") ||
      parsed.pathname.split("/").filter(Boolean).at(-1) ||
      documentId;
  } catch {
    documentId = sourceUrl.slice(-24);
  }

  return [
    meeting.section === "Past Meetings" ? "past" : "upcoming",
    meeting.dateText ? slugify(meeting.dateText) : "no-date",
    slugify(meeting.title || "untitled-meeting"),
    slugify(docType),
    slugify(documentId)
  ]
    .filter(Boolean)
    .join("__");
}

function isIqm2DownloadCandidate(doc: PrimeGovDocument) {
  if (["Video", "Audio", "Captions", "Calendar", "Meeting Details", "Other"].includes(doc.type)) {
    return false;
  }

  const url = doc.url.toLowerCase();
  return (
    doc.type === "Agenda" ||
    doc.type === "Agenda Packet" ||
    doc.type === "Minutes" ||
    doc.type === "Document" ||
    url.includes("fileopen.aspx") ||
    url.endsWith(".pdf")
  );
}

const OFFICIAL_SITE_DOWNLOADABLE_DOCUMENT_TYPES = new Set<PrimeGovDocument["type"]>([
  "Agenda",
  "Agenda Packet",
  "Minutes",
  "Notice of Cancellation",
  "Special Event Notice",
  "Early Staff Report Release",
  "Document",
  "Attachment"
]);

function officialSiteDocumentFilename(
  meeting: PrimeGovMeeting,
  docType: string,
  sourceUrl: string
) {
  let documentId = "unknown-id";

  try {
    const parsed = new URL(sourceUrl);
    documentId =
      parsed.searchParams.get("id") ||
      parsed.searchParams.get("file") ||
      parsed.pathname.split("/").filter(Boolean).at(-1) ||
      documentId;
  } catch {
    documentId = sourceUrl.slice(-24);
  }

  const sourceHash = crypto.createHash("sha256").update(sourceUrl).digest("hex").slice(0, 10);
  const meetingSlug = slugify(
    meeting.externalId || `${meeting.dateText || "no-date"}-${meeting.title || "untitled-meeting"}`
  ).slice(0, 70);
  const docSlug = slugify(documentId).slice(0, 48);

  return [
    meeting.jurisdictionSlug || "official-site",
    meetingSlug,
    slugify(docType).slice(0, 32),
    `${docSlug}-${sourceHash}`
  ]
    .filter(Boolean)
    .join("__");
}

function isOfficialSiteDownloadCandidate(doc: PrimeGovDocument) {
  if (!OFFICIAL_SITE_DOWNLOADABLE_DOCUMENT_TYPES.has(doc.type)) return false;

  const url = doc.url.toLowerCase();
  if (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("zoom.us") ||
    url.includes("openforms.com")
  ) {
    return false;
  }

  return true;
}

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
      if (options.shouldStop?.()) {
        log("Stopping document downloads early because the pipeline deadline is near.");
        return { downloaded, failed };
      }

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

export async function downloadIqm2Documents(
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
    const iqm2Docs = meeting.documents.filter(isIqm2DownloadCandidate);

    for (const doc of iqm2Docs) {
      if (options.shouldStop?.()) {
        log("Stopping IQM2 document downloads early because the pipeline deadline is near.");
        return { downloaded, failed };
      }

      const baseFilename = iqm2DocumentFilename(meeting, doc.type, doc.url);

      try {
        const response = await context.request.get(doc.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 SimpleCity IQM2 scraper",
            Referer: meeting.meetingDetailsUrl || meeting.sourceUrl || doc.url
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
        const contentType = response.headers()["content-type"] || "";
        const firstBytes = buffer.subarray(0, 5).toString();

        if (firstBytes === "%PDF-") {
          const filePath = path.join(docsDir, `${baseFilename}.pdf`);
          await fs.writeFile(filePath, buffer);

          downloaded += 1;
          doc.localPath = filePath;
          doc.bytes = buffer.length;
          doc.downloadError = null;

          log(`Downloaded: ${filePath}`);
          continue;
        }

        const bodyText = buffer.toString("utf8");
        if (contentType.includes("text/html") || /^\s*</.test(bodyText)) {
          const extractedText = htmlToText(bodyText);

          if (isIqm2ErrorHtml(extractedText)) {
            const errorPath = path.join(docsDir, `${baseFilename}.error.html`);
            await fs.writeFile(errorPath, buffer);

            failed += 1;
            doc.localPath = null;
            doc.bytes = buffer.length;
            doc.downloadError = `IQM2 returned an error HTML page. Saved response to ${errorPath}`;
            log(`IQM2 returned error HTML: ${doc.url}`);
            continue;
          }

          const filePath = path.join(docsDir, `${baseFilename}.html`);
          await fs.writeFile(filePath, buffer);

          downloaded += 1;
          doc.localPath = filePath;
          doc.bytes = buffer.length;
          doc.extractedText = extractedText;
          doc.extractionCharacterCount = extractedText.length;
          doc.downloadError = null;

          if (extractedText.length < 200) {
            meeting.extractionNotes = [
              ...(meeting.extractionNotes || []),
              `${doc.type} HTML had little extractable text.`
            ];
          }

          log(`Saved HTML document text: ${filePath}`);
          continue;
        }

        const errorPath = path.join(docsDir, `${baseFilename}.download`);
        await fs.writeFile(errorPath, buffer);

        failed += 1;
        doc.localPath = null;
        doc.bytes = buffer.length;
        doc.downloadError = `Downloaded file was not a PDF or HTML document. Saved response to ${errorPath}`;
        log(`Unsupported IQM2 document response: ${doc.url}`);
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

export async function downloadOfficialSiteDocuments(
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
    const officialDocs = meeting.documents.filter(isOfficialSiteDownloadCandidate);

    for (const doc of officialDocs) {
      if (options.shouldStop?.()) {
        log("Stopping official-site document downloads early because the pipeline deadline is near.");
        return { downloaded, failed };
      }

      const baseFilename = officialSiteDocumentFilename(meeting, doc.type, doc.url);

      try {
        const response = await context.request.get(doc.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 SimpleCity official-site agenda scraper",
            Referer: meeting.sectionUrl || meeting.sourceUrl || doc.url
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
        const contentType = response.headers()["content-type"] || "";
        const firstBytes = buffer.subarray(0, 5).toString();

        if (firstBytes === "%PDF-") {
          const filePath = path.join(docsDir, `${baseFilename}.pdf`);
          await fs.writeFile(filePath, buffer);

          downloaded += 1;
          doc.localPath = filePath;
          doc.bytes = buffer.length;
          doc.downloadError = null;
          log(`Downloaded: ${filePath}`);
          continue;
        }

        const bodyText = buffer.toString("utf8");
        if (contentType.includes("text/html") || /^\s*</.test(bodyText)) {
          const extractedText = htmlToText(bodyText);
          const filePath = path.join(docsDir, `${baseFilename}.html`);
          await fs.writeFile(filePath, buffer);

          downloaded += 1;
          doc.localPath = filePath;
          doc.bytes = buffer.length;
          doc.extractedText = extractedText;
          doc.extractionCharacterCount = extractedText.length;
          doc.downloadError = null;

          if (extractedText.length < 200) {
            meeting.extractionNotes = [
              ...(meeting.extractionNotes || []),
              `${doc.type} HTML had little extractable text.`
            ];
          }

          log(`Saved HTML document text: ${filePath}`);
          continue;
        }

        const errorPath = path.join(docsDir, `${baseFilename}.download`);
        await fs.writeFile(errorPath, buffer);

        failed += 1;
        doc.localPath = null;
        doc.bytes = buffer.length;
        doc.downloadError = `Downloaded file was not a PDF or HTML document. Saved response to ${errorPath}`;
        log(`Unsupported official-site document response: ${doc.url}`);
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
