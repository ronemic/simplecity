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
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdfText(localPath?: string | null): Promise<PdfTextResult | null> {
  if (!localPath) return null;

  try {
    const buffer = await fs.readFile(localPath);
    const parsed = await pdfParse(buffer);
    const text = cleanPdfText(parsed.text);
    const characters = text.length;

    return {
      pages: parsed.numpages,
      characters,
      text,
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
    return {
      pages: null,
      characters: doc.extractionCharacterCount || doc.extractedText.length,
      text: doc.extractedText,
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
