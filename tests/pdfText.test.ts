import assert from "node:assert/strict";
import test from "node:test";
import type { PdfParseResult } from "pdf-parse";
import {
  extractPdfText,
  isLikelyReadablePdfText,
  MAX_EXTRACTED_PDF_TEXT_CHARACTERS
} from "@/lib/scraper/pdfText";

test("extracts PDF text from the local path without reading it into a Buffer first", async () => {
  let receivedInput: Buffer | string | null = null;
  const parsed: PdfParseResult = {
    numpages: 2,
    numrender: 2,
    info: {},
    metadata: null,
    text: "Agenda item one approves the public works contract. ".repeat(12),
    version: "test"
  };

  const result = await extractPdfText("/tmp/large-agenda.pdf", async (input) => {
    receivedInput = input;
    return parsed;
  });

  assert.equal(receivedInput, "/tmp/large-agenda.pdf");
  assert.equal(result?.pages, 2);
  assert.match(result?.text || "", /public works contract/);
});

test("bounds accumulated text while still rendering every PDF page", async () => {
  const renderedPages: string[] = [];
  const result = await extractPdfText(
    "/tmp/text-heavy-packet.pdf",
    async (_input, options) => {
      for (let index = 0; index < 3; index += 1) {
        renderedPages.push(
          await options!.pagerender!({
            getTextContent: async () => ({
              items: [
                {
                  str: "Council agenda item text ".repeat(20),
                  transform: [1, 0, 0, 1, 0, 700]
                }
              ]
            }),
            getAnnotations: async () => []
          })
        );
      }
      return {
        numpages: 3,
        numrender: 3,
        info: {},
        metadata: null,
        text: renderedPages.join("\n\n"),
        version: "test"
      };
    },
    100
  );

  assert.equal(renderedPages.length, 3);
  assert.equal(renderedPages[1], "");
  assert.equal(renderedPages[2], "");
  assert.ok((result?.text.length || 0) <= 100);
  assert.equal(MAX_EXTRACTED_PDF_TEXT_CHARACTERS, 2_000_000);
});

test("classifies readable text without allocating global regex match arrays", () => {
  assert.equal(
    isLikelyReadablePdfText("The council considers a public works contract. ".repeat(20)),
    true
  );
  assert.equal(isLikelyReadablePdfText("\u0080".repeat(20) + "A".repeat(500)), false);
  assert.equal(isLikelyReadablePdfText("1234567890 !@#$%^&*() ".repeat(30)), false);
  assert.equal(isLikelyReadablePdfText("A B C D ".repeat(100)), false);
});


test("separates word-per-item PDFs without breaking kerned words", async () => {
  // Real shape from Redwood City minutes: one item per word, no trailing spaces.
  const words = ["Motion", "and", "second,", "Chu", "and", "Gee", "to", "approve", "item", "7A,"];
  let cursor = 100;
  const items = words.map((word) => {
    const transform = [1, 0, 0, 1, cursor, 700];
    const width = word.length * 5;
    cursor += width + 4; // a real inter-word gap
    return { str: word, transform, width, height: 10 };
  });
  // A kerning split inside "approved": no gap between the pieces.
  items.push({ str: "approve", transform: [1, 0, 0, 1, cursor, 700], width: 35, height: 10 });
  items.push({ str: "d", transform: [1, 0, 0, 1, cursor + 35, 700], width: 5, height: 10 });

  const result = await extractPdfText("/tmp/redwood-city-minutes.pdf", async (_input, options) => {
    const page = await options!.pagerender!({
      getTextContent: async () => ({ items }),
      getAnnotations: async () => []
    });
    return {
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: null,
      text: page,
      version: "test"
    };
  });

  const text = result?.text || "";
  assert.match(text, /Motion and second, Chu and Gee to approve item 7A,/);
  // The kerned split must not become two words.
  assert.match(text, /approved/);
  assert.ok(!/approve d/.test(text), text);
});

test("keeps existing spacing and line breaks untouched", async () => {
  const result = await extractPdfText("/tmp/normal.pdf", async (_input, options) => {
    const page = await options!.pagerender!({
      getTextContent: async () => ({
        items: [
          { str: "The Council approved ", transform: [1, 0, 0, 1, 0, 700], width: 100, height: 10 },
          { str: "the contract.", transform: [1, 0, 0, 1, 100, 700], width: 60, height: 10 },
          { str: "Next line here.", transform: [1, 0, 0, 1, 0, 680], width: 70, height: 10 }
        ]
      }),
      getAnnotations: async () => []
    });
    return { numpages: 1, numrender: 1, info: {}, metadata: null, text: page, version: "test" };
  });

  // No doubled space where the item already ended with one, and the y change still breaks the line.
  assert.match(result?.text || "", /The Council approved the contract\.\nNext line here\./);
});
