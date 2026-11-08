import type { Category } from '../generated/prisma/client.js';

// One line on the receipt, already in integer cents
export interface OcrItem {
  name: string;
  unitPriceCents: number;
  quantity: number;
}

// What any receipt reader returns. Everything except items is optional, because a
// blurry or unusual receipt may not show it. The user always checks and edits the result.
export interface OcrResult {
  merchant?: string;
  date?: string; // YYYY-MM-DD
  items: OcrItem[];
  subtotalCents?: number;
  serviceCents?: number;
  gstCents?: number;
  totalCents?: number;
  category?: Category;
  raw: unknown; // the provider's own answer, kept for debugging
}

// The contract every OCR provider follows (Fake now, Gemini in KAN-33, Tesseract maybe)
export interface OcrService {
  extract(image: Buffer, mimeType: string): Promise<OcrResult>;
}

// TypeScript interfaces disappear when the code is compiled, so Nest can't use
// OcrService itself to find the provider. This token is a real value it can use instead:
//   constructor(@Inject(OCR_SERVICE) private readonly ocr: OcrService) {}
export const OCR_SERVICE = Symbol('OCR_SERVICE');
