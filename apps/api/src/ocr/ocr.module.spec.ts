import { Inject, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FakeOcrService } from './fake-ocr.service.js';
import { GeminiOcrService } from './gemini-ocr.service.js';
import { createOcrService } from './ocr.factory.js';
import {
  OCR_SERVICE,
  type OcrResult,
  type OcrService,
} from './ocr.interface.js';
import { OcrModule } from './ocr.module.js';

// A pretend consumer, written the way real code (receipt upload, KAN-33) will be:
// it only knows the OCR_SERVICE token and the OcrService interface, never a class
@Injectable()
class ReceiptReader {
  constructor(@Inject(OCR_SERVICE) private readonly ocr: OcrService) {}

  read(image: Buffer) {
    return this.ocr.extract(image, 'image/jpeg');
  }
}

const photo = Buffer.from('not really a photo');

describe('createOcrService (the provider is chosen by config)', () => {
  it('gives the Fake when OCR_PROVIDER is fake', () => {
    expect(createOcrService({ OCR_PROVIDER: 'fake' })).toBeInstanceOf(
      FakeOcrService,
    );
  });

  it('uses the Fake when OCR_PROVIDER is not set', () => {
    expect(createOcrService({})).toBeInstanceOf(FakeOcrService);
  });

  it('ignores case and spaces', () => {
    expect(createOcrService({ OCR_PROVIDER: ' FAKE ' })).toBeInstanceOf(
      FakeOcrService,
    );
  });

  it('gives Gemini when OCR_PROVIDER is gemini and a key is set', () => {
    const ocr = createOcrService({
      OCR_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'test-key',
    });
    expect(ocr).toBeInstanceOf(GeminiOcrService);
    expect(ocr.provider).toBe('gemini');
  });

  it('stops at startup if gemini is chosen without a key', () => {
    expect(() => createOcrService({ OCR_PROVIDER: 'gemini' })).toThrow(
      'GEMINI_API_KEY is required when OCR_PROVIDER=gemini',
    );
  });

  it('stops at startup if tesseract is chosen before it exists', () => {
    expect(() => createOcrService({ OCR_PROVIDER: 'tesseract' })).toThrow(
      'OCR_PROVIDER=tesseract is not available yet',
    );
  });

  it('stops at startup on a typo, instead of failing on the first receipt', () => {
    expect(() => createOcrService({ OCR_PROVIDER: 'gemnii' })).toThrow(
      'OCR_PROVIDER must be one of: fake, gemini, tesseract (got "gemnii")',
    );
  });
});

describe('OcrModule (dependency injection)', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function readerWith(
    build: (b: ReturnType<typeof Test.createTestingModule>) => unknown = (b) =>
      b,
  ) {
    const builder = Test.createTestingModule({
      imports: [OcrModule],
      providers: [ReceiptReader],
    });
    build(builder);
    const moduleRef = await builder.compile();
    return moduleRef.get(ReceiptReader);
  }

  it('injects the provider named in OCR_PROVIDER', async () => {
    vi.stubEnv('OCR_PROVIDER', 'fake');
    const result = await (await readerWith()).read(photo);
    expect(result.merchant).toBe('Maxwell Food Centre');
  });

  it('can be swapped in a test with overrideProvider, without touching the consumer', async () => {
    const stub: OcrService = {
      provider: 'stub',
      extract: async () => ({
        items: [{ name: 'Kopi', unitPriceCents: 150, quantity: 1 }],
        raw: {},
      }),
    };
    const reader = await readerWith((b) =>
      b.overrideProvider(OCR_SERVICE).useValue(stub),
    );
    const result = await reader.read(photo);
    expect(result.items).toEqual([
      { name: 'Kopi', unitPriceCents: 150, quantity: 1 },
    ]);
  });
});

describe('FakeOcrService', () => {
  const fake = new FakeOcrService();

  it("returns the brief's bill, in integer cents", async () => {
    const result: OcrResult = await fake.extract(photo, 'image/jpeg');
    expect(result.items).toEqual([
      { name: 'Chicken Rice', unitPriceCents: 600, quantity: 1 },
      { name: 'Laksa', unitPriceCents: 750, quantity: 1 },
      { name: 'Tiger Beer', unitPriceCents: 800, quantity: 2 },
    ]);
    expect(result).toMatchObject({
      subtotalCents: 2950,
      serviceCents: 295,
      gstCents: 292,
      totalCents: 3537,
      category: 'FOOD_DRINKS',
    });
  });

  it('has items that add up to its subtotal', async () => {
    const result = await fake.extract(photo, 'image/jpeg');
    const sum = result.items.reduce(
      (a, i) => a + i.unitPriceCents * i.quantity,
      0,
    );
    expect(sum).toBe(result.subtotalCents);
  });

  it('returns a fresh copy each time, so a caller editing it cannot change the next result', async () => {
    const first = await fake.extract(photo, 'image/jpeg');
    first.items[0].unitPriceCents = 1;
    const second = await fake.extract(photo, 'image/jpeg');
    expect(second.items[0].unitPriceCents).toBe(600);
  });
});
