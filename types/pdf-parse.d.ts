declare module "pdf-parse" {
  export interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    text: string;
    version: string;
  }

  export interface PdfTextItem {
    str: string;
    transform: number[];
    width?: number;
    height?: number;
  }

  export interface PdfAnnotation {
    url?: string;
    rect?: number[];
    subtype?: string;
  }

  export interface PdfPageData {
    getTextContent(options?: Record<string, unknown>): Promise<{ items: PdfTextItem[] }>;
    getAnnotations(options?: Record<string, unknown>): Promise<PdfAnnotation[]>;
  }

  export interface PdfParseOptions {
    pagerender?: (page: PdfPageData) => Promise<string> | string;
    max?: number;
    version?: string;
  }

  export default function pdfParse(
    buffer: Buffer,
    options?: PdfParseOptions
  ): Promise<PdfParseResult>;
}
