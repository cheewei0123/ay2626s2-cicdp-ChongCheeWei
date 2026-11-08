import { Injectable } from '@nestjs/common';
import type { OcrResult, OcrService } from './ocr.interface.js';

// The brief's example bill, as a real OCR would read it
const BRIEF_RECEIPT: OcrResult = {
  merchant: 'Maxwell Food Centre',
  date: '2026-11-01',
  items: [
    { name: 'Chicken Rice', unitPriceCents: 600, quantity: 1 },
    { name: 'Laksa', unitPriceCents: 750, quantity: 1 },
    { name: 'Tiger Beer', unitPriceCents: 800, quantity: 2 },
  ],
  subtotalCents: 2950,
  serviceCents: 295,
  gstCents: 292,
  totalCents: 3537,
  category: 'FOOD_DRINKS',
  raw: { provider: 'fake' },
};

// Used in tests, in CI and in local development: no API key, no cost, no network,
// and always the same answer, so tests never become flaky
@Injectable()
export class FakeOcrService implements OcrService {
  async extract(_image: Buffer, _mimeType: string): Promise<OcrResult> {
    // A deep copy, so a caller changing the result can't change the next one
    return structuredClone(BRIEF_RECEIPT);
  }
}
