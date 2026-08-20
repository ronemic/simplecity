import pdfParse, { type PdfPageData } from "pdf-parse";
import type { PrimeGovDocument } from "@/lib/types";

export const MAX_EXTRACTED_PDF_TEXT_CHARACTERS = 2_000_000;

export type PdfTextResult = {
  pages: number | null;
  characters: number;
  text: string;
  error?: string;
  isScanned: boolean;
};

export function cleanPdfText(text = "") {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isLikelyReadablePdfText(text = "") {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const length = trimmed.length;
  let c1ControlCharacters = 0;
  let letters = 0;
  let words = 0;
  let consecutiveLetters = 0;

  for (let index = 0; index < trimmed.length; index += 1) {
    const code = trimmed.charCodeAt(index);
    if (code >= 0x80 && code <= 0x9f) c1ControlCharacters += 1;

    const isAsciiLetter =
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a);
    if (isAsciiLetter) {
      letters += 1;
      consecutiveLetters += 1;
    } else {
      if (consecutiveLetters >= 2) words += 1;
      consecutiveLetters = 0;
    }
  }
  if (consecutiveLetters >= 2) words += 1;

  if (length >= 200 && c1ControlCharacters / length > 0.02) return false;

  if (length >= 200 && letters / length < 0.2) return false;
  if (length >= 500 && words < 20) return false;

  return true;
}

/**
 * Most PDFs carry their inter-word spacing inside each text item, but some emit
 * one item per word with no trailing space. Joining those directly produced text
 * like "Motionandsecond, ChuandGeetoapproveitem7A", which no word-boundary
 * matching can read.
 *
 * A space is added only when the glyphs are measurably apart, so items split
 * mid-word for kerning stay joined.
 */
function itemSeparator(item: {
  previous: string;
  current: string;
  sameLine: boolean;
  firstItem: boolean;
  gap: number | null;
  height?: number;
}) {
  if (item.firstItem) return "";
  if (!item.sameLine) return "\n";
  if (item.gap === null) return "";
  if (/\s$/.test(item.previous) || /^\s/.test(item.current)) return "";
  // Scaled to the glyph height so the test holds at any font size, with a floor
  // for pages that report no height.
  return item.gap > Math.max(0.5, (item.height || 10) * 0.2) ? " " : "";
}

export async function extractPdfText(
  localPath?: string | null,
  parsePdf: typeof pdfParse = pdfParse,
  maxCharacters = MAX_EXTRACTED_PDF_TEXT_CHARACTERS
): Promise<PdfTextResult | null> {
  if (!localPath) return null;

  try {
    let remainingCharacters = Math.max(1, Math.floor(maxCharacters));
    const parsed = await parsePdf(localPath, {
      version: "v2.0.550",
      pagerender: async (page: PdfPageData) => {
        try {
          if (remainingCharacters <= 0) return "";
          const textContent = await page.getTextContent({
            normalizeWhitespace: false,
            disableCombineTextItems: false
          });
          const chunks: string[] = [];
          let lastY: number | undefined;
          let lastEndX: number | undefined;
          let previous = "";

          for (const item of textContent.items) {
            if (remainingCharacters <= 0) break;
            const x = item.transform?.[4];
            const y = item.transform?.[5];
            const value = `${itemSeparator({
              previous,
              current: item.str,
              sameLine: lastY !== undefined && lastY === y,
              firstItem: lastY === undefined,
              gap: typeof x === "number" && typeof lastEndX === "number"
                ? x - lastEndX
                : null,
              height: item.height
            })}${item.str}`.slice(0, remainingCharacters);
            chunks.push(value);
            remainingCharacters -= value.length;
            lastY = y;
            lastEndX = typeof x === "number" ? x + (item.width || 0) : undefined;
            previous = item.str;
          }

          return chunks.join("");
        } finally {
          page.cleanup?.();
        }
      }
    });
    const text = cleanPdfText(parsed.text);
    const isReadable =
      isLikelyReadablePdfText(parsed.text) && isLikelyReadablePdfText(text);
    const usableText = isReadable ? text : "";
    const characters = usableText.length;

    return {
      pages: parsed.numpages,
      characters,
      text: usableText,
      isScanned: characters < 200
    };
  } catch (error) {
    return {
      pages: null,
      characters: 0,
      text: "",
      error: error instanceof Error ? error.message : "Unknown PDF parse error",
      isScanned: false
    };
  }
}

export async function extractPdfTextForDocument(doc: PrimeGovDocument) {
  if (!doc.localPath) return null;
  if (typeof doc.extractedText === "string") {
    const text = cleanPdfText(doc.extractedText);
    const isReadable =
      isLikelyReadablePdfText(doc.extractedText) && isLikelyReadablePdfText(text);

    if (!isReadable) {
      doc.extractedText = "";
      doc.extractionCharacterCount = 0;
      doc.isScanned = true;

      return {
        pages: null,
        characters: 0,
        text: "",
        isScanned: true
      };
    }

    doc.extractedText = text;
    doc.extractionCharacterCount = doc.extractionCharacterCount || text.length;

    return {
      pages: null,
      characters: doc.extractionCharacterCount,
      text,
      isScanned: Boolean(doc.isScanned)
    };
  }

  const result = await extractPdfText(doc.localPath);
  if (!result) return null;

  doc.extractedText = result.text;
  doc.extractionCharacterCount = result.characters;
  doc.isScanned = result.isScanned;
  if (result.error) doc.downloadError = doc.downloadError || result.error;

  return result;
}

export async function extractPdfTextForMeetings(meetings: { documents: PrimeGovDocument[] }[]) {
  const notes: string[] = [];

  for (const meeting of meetings) {
    for (const doc of meeting.documents) {
      if (!doc.localPath) continue;
      const result = await extractPdfTextForDocument(doc);
      if (result?.error) notes.push(`${doc.url}: ${result.error}`);
    }
  }

  return notes;
}
