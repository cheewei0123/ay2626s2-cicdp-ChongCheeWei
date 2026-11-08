import { FakeOcrService } from './fake-ocr.service.js';
import type { OcrService } from './ocr.interface.js';

const PROVIDERS = ['fake', 'gemini', 'tesseract'] as const;

// Chooses the OCR implementation from the OCR_PROVIDER setting (strategy pattern).
// Adding Gemini in KAN-33 means adding one line here; no code that uses OCR changes.
export function createOcrService(setting: string | undefined): OcrService {
  const provider = (setting ?? 'fake').trim().toLowerCase();

  if (provider === 'fake') return new FakeOcrService();

  if ((PROVIDERS as readonly string[]).includes(provider)) {
    // Fail at startup, not on the first real receipt
    throw new Error(
      `OCR_PROVIDER=${provider} is not available yet; use fake until it is built`,
    );
  }
  throw new Error(
    `OCR_PROVIDER must be one of: ${PROVIDERS.join(', ')} (got "${setting}")`,
  );
}
