import fs from "node:fs/promises";
import pdfParse from "pdf-parse";
import type { PrimeGovDocument } from "@/lib/types";

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
  const c1ControlCharacters = trimmed.match(/[\u0080-\u009F]/g)?.length || 0;
  if (length >= 200 && c1ControlCharacters / length > 0.02) return false;

  const letters = trimmed.match(/[A-Za-z]/g)?.length || 0;
  const words = trimmed.match(/[A-Za-z]{2,}/g)?.length || 0;
  if (length >= 200 && letters / length < 0.2) return false;
  if (length >= 500 && words < 20) return false;

  return true;
}

export async function extractPdfText(localPath?: string | null): Promise<PdfTextResult | null> {
  if (!localPath) return null;

  try {
    const buffer = await fs.readFile(localPath);
    const parsed = await pdfParse(buffer);
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
