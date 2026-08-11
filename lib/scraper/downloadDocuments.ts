import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright";
import type { PrimeGovDocument, PrimeGovMeeting } from "@/lib/types";
import { isUsableOfficialSourceText } from "./documentUsability";
import {
  buildDownloadFilename,
  isUsablePrimeGovHtmlAgendaText,
  resolvePrimeGovAttachmentDownloadUrl
} from "./primegov";
import {
  createStreamDownloadBudget,
  streamDownloadToTemp,
  STREAM_DOWNLOAD_MAX_FILE_BYTES,
  type StreamDownloadBudget
} from "./streamDownload";
import { slugify } from "@/lib/utils/slug";

export const SCRAPED_DIR = path.join(process.cwd(), "scraped-primegov");
export const DOCUMENTS_DIR = path.join(SCRAPED_DIR, "documents");
export const EMPTY_OFFICIAL_DOCUMENT_ERROR =
  "Official document endpoint returned an empty unpublished placeholder.";
const DOCUMENT_REQUEST_TIMEOUT_MS = 60_000;
const MAX_BUFFERED_TEXT_DOCUMENT_BYTES = 50 * 1024 * 1024;
const OFFICIAL_TEXT_FALLBACK_MAX_BYTES = 10 * 1024 * 1024;

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
  onlyPending?: boolean;
  /** Explicit operator/test hard override. Production callers use the 1 GiB streaming ceiling. */
  maxBytes?: number;
  maxTotalBytes?: number;
  minFreeBytes?: number;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
  validateFinalUrl?: (url: string) => boolean;
  documentFilter?: (document: PrimeGovDocument) => boolean;
  userAgent?: string;
  plainTextFallbackUrl?: (documentUrl: string) => string | null;
  fetchImpl?: typeof fetch;
  statfsImpl?: (directory: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }>;
  downloadBudget?: StreamDownloadBudget;
};

const PRIMARY_DOCUMENT_TYPES = new Set<PrimeGovDocument["type"]>([
  "Agenda",
  "Accessible Agenda",
  "Minutes",
  "Accessible Minutes"
]);
const ITEM_ATTACHMENT_TYPES = new Set<PrimeGovDocument["type"]>([
  "Attachment",
  "Staff Report",
  "Resolution",
  "Ordinance",
  "Contract",
  "Exhibit",
  "Public Comment"
]);

function documentRequestTimeout(options: DownloadDocumentsOptions) {
  return Math.min(
    options.timeoutMs && options.timeoutMs > 0
      ? options.timeoutMs
      : DOCUMENT_REQUEST_TIMEOUT_MS,
    DOCUMENT_REQUEST_TIMEOUT_MS
  );
}

function documentDownloadPriority(document: PrimeGovDocument) {
  if (PRIMARY_DOCUMENT_TYPES.has(document.type)) return 0;
  if (document.type === "Notice of Cancellation") return 1;
  if (document.type === "Agenda Packet" || document.type === "Packet") return 2;
  if (document.isAgendaItemAttachment || ITEM_ATTACHMENT_TYPES.has(document.type)) return 4;
  return 3;
}

function prioritizedDocuments(documents: PrimeGovDocument[]) {
  return [...documents].sort(
    (left, right) => documentDownloadPriority(left) - documentDownloadPriority(right)
  );
}

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

function decodedOfficialPlainText(buffer: Buffer, contentType: string) {
  const raw = buffer.toString("utf8").trim();
  if (!raw || raw.includes("\u0000")) return "";

  let text = "";
  const isJson = /\bjson\b/i.test(contentType);
  const isPlainText = /^(?:text\/plain|application\/octet-stream)\b/i.test(contentType);
  if (isJson || (isPlainText && raw.startsWith("{"))) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const candidate = (parsed as Record<string, unknown>).plainText;
        if (typeof candidate === "string") text = candidate.trim();
      }
    } catch {
      return "";
    }
  } else if (isPlainText) {
    text = raw;
  }

  return isUsableOfficialSourceText(text) ? text : "";
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
    doc.isAgendaItemAttachment ||
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
  "Attachment",
  "Staff Report",
  "Resolution",
  "Ordinance",
  "Contract",
  "Exhibit",
  "Public Comment"
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

function downloadBudget(options: DownloadDocumentsOptions) {
  return options.downloadBudget || createStreamDownloadBudget(options.maxTotalBytes);
}

function streamingOptions(
  options: DownloadDocumentsOptions,
  budget: StreamDownloadBudget,
  headers: Record<string, string>,
  maxFileBytes = options.maxBytes || STREAM_DOWNLOAD_MAX_FILE_BYTES
) {
  return {
    headers,
    validateUrl: options.validateFinalUrl,
    shouldStop: options.shouldStop,
    budget,
    maxFileBytes: Math.min(maxFileBytes, STREAM_DOWNLOAD_MAX_FILE_BYTES),
    minFreeBytes: options.minFreeBytes,
    headerTimeoutMs: documentRequestTimeout(options),
    idleTimeoutMs: options.idleTimeoutMs,
    totalTimeoutMs: options.totalTimeoutMs,
    fetchImpl: options.fetchImpl,
    statfsImpl: options.statfsImpl
  };
}

function streamedContentType(headers: Headers) {
  return headers.get("content-type") || "";
}

function streamedPrefixIsHtml(prefix: Buffer) {
  return /^\s*</.test(prefix.toString("utf8"));
}

function responsePrefixMetadata(prefix: Buffer) {
  const text = prefix
    .toString("utf8")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return text ? ` Response prefix: ${JSON.stringify(text)}.` : "";
}

async function readBufferedTextDocument(tempPath: string, bytes: number) {
  if (bytes > MAX_BUFFERED_TEXT_DOCUMENT_BYTES) return null;
  return fs.readFile(tempPath);
}

async function downloadOfficialPlainTextFallback(
  context: BrowserContext,
  fallbackUrl: string,
  targetPath: string,
  finalPath: string,
  options: DownloadDocumentsOptions,
  budget: StreamDownloadBudget,
  headers: Record<string, string>
) {
  const fallbackMaxBytes = Math.min(
    options.maxBytes && options.maxBytes > 0
      ? options.maxBytes
      : OFFICIAL_TEXT_FALLBACK_MAX_BYTES,
    OFFICIAL_TEXT_FALLBACK_MAX_BYTES
  );
  const fallback = await streamDownloadToTemp(
    context,
    fallbackUrl,
    targetPath,
    streamingOptions(options, budget, headers, fallbackMaxBytes)
  );

  try {
    if (fallback.bytes === 0) {
      throw new Error("Plain-text fallback returned an empty response.");
    }
    const fallbackBuffer = await fs.readFile(fallback.tempPath);
    const text = decodedOfficialPlainText(
      fallbackBuffer,
      streamedContentType(fallback.headers)
    );
    if (!text) {
      throw new Error(
        `Plain-text fallback did not return usable official text.${responsePrefixMetadata(fallback.prefix)}`
      );
    }

    await fs.writeFile(fallback.tempPath, text, "utf8");
    await fallback.commit(finalPath);
    return { bytes: Buffer.byteLength(text), text };
  } finally {
    await fallback.cleanup();
  }
}

export async function downloadCompiledDocuments(
  context: BrowserContext,
  meetings: PrimeGovMeeting[],
  options: DownloadDocumentsOptions = {}
) {
  const docsDir = options.outputDir || DOCUMENTS_DIR;
  const log = options.log || (() => undefined);
  const budget = downloadBudget(options);
  let downloaded = 0;
  let failed = 0;

  await fs.mkdir(docsDir, { recursive: true });

  for (const meeting of meetings) {
    const hasUsableHtmlAgenda = isUsablePrimeGovHtmlAgendaText(meeting.htmlAgendaText || "");
    const compiledDocs = prioritizedDocuments(
      meeting.documents.filter(
        (doc) =>
          (doc.url.includes("/Public/CompiledDocument") || doc.isAgendaItemAttachment) &&
          !(hasUsableHtmlAgenda && doc.type === "Packet")
      )
    );
    if (
      hasUsableHtmlAgenda &&
      meeting.documents.some(
        (doc) => doc.type === "Packet" && doc.url.includes("/Public/CompiledDocument")
      )
    ) {
      log(`Skipped PrimeGov packet for ${meeting.title}; a structured HTML agenda is available.`);
    }

    for (const doc of compiledDocs) {
      if (options.shouldStop?.()) {
        log("Stopping document downloads early because the pipeline deadline is near.");
        return { downloaded, failed };
      }

      const filename = buildDownloadFilename(meeting, doc.type, doc.url);
      const filePath = path.join(docsDir, `${filename}.pdf`);

      try {
        const downloadUrl = doc.isAgendaItemAttachment
          ? await resolvePrimeGovAttachmentDownloadUrl(context, doc.url)
          : doc.url;
        if (!downloadUrl) {
          failed += 1;
          doc.localPath = null;
          doc.downloadError = "PrimeGov did not provide a current PDF download URL.";
          log(`Failed to resolve download URL for ${doc.url}.`);
          continue;
        }

        const requestHeaders = {
          "User-Agent": "Mozilla/5.0 SimpleCity civic agenda scraper"
        };
        const streamed = await streamDownloadToTemp(
          context,
          downloadUrl,
          filePath,
          streamingOptions(options, budget, requestHeaders)
        );
        try {
          if (streamed.prefix.subarray(0, 5).toString() !== "%PDF-") {
            failed += 1;
            doc.localPath = null;
            doc.bytes = streamed.bytes;
            doc.downloadError = `Downloaded file was not a PDF.${responsePrefixMetadata(streamed.prefix)}`;
            log(`Not a PDF: ${doc.url}`);
            continue;
          }

          await streamed.commit(filePath);
          downloaded += 1;
          doc.localPath = filePath;
          doc.bytes = streamed.bytes;
          doc.downloadError = null;
          log(`Downloaded: ${filePath}`);
        } finally {
          await streamed.cleanup();
        }
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
  const budget = downloadBudget(options);
  let downloaded = 0;
  let failed = 0;

  await fs.mkdir(docsDir, { recursive: true });

  for (const meeting of meetings) {
    const iqm2Docs = prioritizedDocuments(
      meeting.documents.filter(
        (doc) =>
          isIqm2DownloadCandidate(doc) &&
          (options.documentFilter?.(doc) ?? true)
      )
    );

    for (const doc of iqm2Docs) {
      if (options.shouldStop?.()) {
        log("Stopping IQM2 document downloads early because the pipeline deadline is near.");
        return { downloaded, failed };
      }

      const baseFilename = iqm2DocumentFilename(meeting, doc.type, doc.url);
      const targetPath = path.join(docsDir, `${baseFilename}.download`);

      try {
        const requestHeaders = {
          "User-Agent": "Mozilla/5.0 SimpleCity IQM2 scraper",
          Referer: meeting.meetingDetailsUrl || meeting.sourceUrl || doc.url
        };
        const streamed = await streamDownloadToTemp(
          context,
          doc.url,
          targetPath,
          streamingOptions(options, budget, requestHeaders)
        );
        try {
          if (streamed.prefix.subarray(0, 5).toString() === "%PDF-") {
            const filePath = path.join(docsDir, `${baseFilename}.pdf`);
            await streamed.commit(filePath);

            downloaded += 1;
            doc.localPath = filePath;
            doc.bytes = streamed.bytes;
            doc.downloadError = null;
            log(`Downloaded: ${filePath}`);
            continue;
          }

          const contentType = streamedContentType(streamed.headers);
          if (/\btext\/html\b/i.test(contentType) || streamedPrefixIsHtml(streamed.prefix)) {
            const buffer = await readBufferedTextDocument(streamed.tempPath, streamed.bytes);
            const extractedText = buffer ? htmlToText(buffer.toString("utf8")) : null;

            const validationText =
              extractedText || htmlToText(streamed.prefix.toString("utf8"));
            if (
              isIqm2ErrorHtml(validationText) ||
              extractedText === null ||
              !isUsableOfficialSourceText(extractedText)
            ) {
              failed += 1;
              doc.localPath = null;
              doc.bytes = streamed.bytes;
              doc.downloadError = extractedText === null
                ? `IQM2 HTML exceeded the ${MAX_BUFFERED_TEXT_DOCUMENT_BYTES}-byte validation limit.`
                : `IQM2 returned unusable HTML.${responsePrefixMetadata(streamed.prefix)}`;
              log(`IQM2 returned unusable HTML: ${doc.url}`);
              continue;
            }

            const filePath = path.join(docsDir, `${baseFilename}.html`);
            await streamed.commit(filePath);
            downloaded += 1;
            doc.localPath = filePath;
            doc.bytes = streamed.bytes;
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

          failed += 1;
          doc.localPath = null;
          doc.bytes = streamed.bytes;
          doc.downloadError = `Downloaded file was not a PDF or usable HTML document.${responsePrefixMetadata(streamed.prefix)}`;
          log(`Unsupported IQM2 document response: ${doc.url}`);
        } finally {
          await streamed.cleanup();
        }
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
  const budget = downloadBudget(options);
  let downloaded = 0;
  let failed = 0;

  await fs.mkdir(docsDir, { recursive: true });

  for (const meeting of meetings) {
    const officialDocs = prioritizedDocuments(
      meeting.documents.filter(
        (doc) =>
          (options.documentFilter?.(doc) ?? isOfficialSiteDownloadCandidate(doc)) &&
          (!options.onlyPending || (!doc.localPath && !doc.downloadError))
      )
    );

    for (const doc of officialDocs) {
      if (options.shouldStop?.()) {
        log("Stopping official-site document downloads early because the pipeline deadline is near.");
        return { downloaded, failed };
      }

      const baseFilename = officialSiteDocumentFilename(meeting, doc.type, doc.url);
      const targetPath = path.join(docsDir, `${baseFilename}.download`);

      const requestHeaders = {
        "User-Agent": options.userAgent || "Mozilla/5.0 SimpleCity official-site agenda scraper",
        Referer: meeting.sectionUrl || meeting.sourceUrl || doc.url
      };
      let primaryError: string | null = null;

      try {
        const streamed = await streamDownloadToTemp(
          context,
          doc.url,
          targetPath,
          streamingOptions(options, budget, requestHeaders)
        );
        try {
          doc.bytes = streamed.bytes;
          if (streamed.bytes === 0) {
            primaryError = EMPTY_OFFICIAL_DOCUMENT_ERROR;
          } else if (streamed.prefix.subarray(0, 5).toString() === "%PDF-") {
            const filePath = path.join(docsDir, `${baseFilename}.pdf`);
            await streamed.commit(filePath);
            downloaded += 1;
            doc.localPath = filePath;
            doc.downloadError = null;
            log(`Downloaded: ${filePath}`);
            continue;
          } else {
            const contentType = streamedContentType(streamed.headers);
            if (/\btext\/html\b/i.test(contentType) || streamedPrefixIsHtml(streamed.prefix)) {
              const buffer = await readBufferedTextDocument(streamed.tempPath, streamed.bytes);
              const extractedText = buffer ? htmlToText(buffer.toString("utf8")) : null;
              if (extractedText && isUsableOfficialSourceText(extractedText)) {
                const filePath = path.join(docsDir, `${baseFilename}.html`);
                await streamed.commit(filePath);
                downloaded += 1;
                doc.localPath = filePath;
                doc.extractedText = extractedText;
                doc.extractionCharacterCount = extractedText.length;
                doc.downloadError = null;
                log(`Saved HTML document text: ${filePath}`);
                continue;
              }

              primaryError = extractedText === null
                ? `Official HTML exceeded the ${MAX_BUFFERED_TEXT_DOCUMENT_BYTES}-byte validation limit.`
                : `Official site returned unusable HTML.${responsePrefixMetadata(streamed.prefix)}`;
            } else {
              primaryError =
                `Downloaded file was not a PDF or usable HTML document.${responsePrefixMetadata(streamed.prefix)}`;
            }
          }
        } finally {
          await streamed.cleanup();
        }
      } catch (error) {
        primaryError = error instanceof Error ? error.message : "Unknown primary download error";
      }

      const fallbackUrl = options.plainTextFallbackUrl?.(doc.url);
      let fallbackError: string | null = null;
      if (fallbackUrl && !options.shouldStop?.()) {
        try {
          const filePath = path.join(docsDir, `${baseFilename}.txt`);
          const fallback = await downloadOfficialPlainTextFallback(
            context,
            fallbackUrl,
            targetPath,
            filePath,
            options,
            budget,
            requestHeaders
          );
          downloaded += 1;
          doc.localPath = filePath;
          doc.bytes = fallback.bytes;
          doc.extractedText = fallback.text;
          doc.extractionCharacterCount = fallback.text.length;
          doc.downloadError = null;
          log(`Saved official plain-text fallback: ${filePath}`);
          continue;
        } catch (error) {
          fallbackError = error instanceof Error ? error.message : "Unknown fallback error";
          log(`Plain-text fallback failed for ${doc.url}: ${fallbackError}`);
        }
      }

      failed += 1;
      doc.localPath = null;
      const primaryMessage = `Primary document failed: ${primaryError || "unusable response"}`;
      doc.downloadError = fallbackError
        ? `${primaryMessage} Plain-text fallback failed: ${fallbackError}`
        : primaryMessage;
      log(`Download error for ${doc.url}: ${doc.downloadError}`);
    }
  }

  return { downloaded, failed };
}
