import { GoogleGenAI } from '@google/genai';
import { FakeOcrService } from './fake-ocr.service.js';
import { GeminiOcrService } from './gemini-ocr.service.js';
import type { OcrService } from './ocr.interface.js';

const PROVIDERS = ['fake', 'gemini', 'tesseract'] as const;

type OcrEnv = {
  OCR_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
};

// Chooses the OCR implementation from the OCR_PROVIDER setting (strategy pattern).
// No code that uses OCR changes when the provider changes.
export function createOcrService(env: OcrEnv): OcrService {
  const setting = env.OCR_PROVIDER;
  const provider = (setting ?? 'fake').trim().toLowerCase();

  if (provider === 'fake') return new FakeOcrService();

  if (provider === 'gemini') {
    // Fail at startup, not on the first real receipt
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required when OCR_PROVIDER=gemini');
    }
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    return new GeminiOcrService(
      (request) => ai.models.generateContent(request),
      // A setting, so a retired model is a one-line .env change
      env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite',
    );
  }

  if ((PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(
      `OCR_PROVIDER=${provider} is not available yet; use fake or gemini`,
    );
  }
  throw new Error(
    `OCR_PROVIDER must be one of: ${PROVIDERS.join(', ')} (got "${setting}")`,
  );
}
