import { HttpException } from '@nestjs/common';
import { ApiError } from '@google/genai';
import ntuc from './fixtures/gemini-ntuc-response.json' with { type: 'json' };
import sample from './fixtures/gemini-response.json' with { type: 'json' };
import { GeminiOcrService, type GenerateFn } from './gemini-ocr.service.js';

const photo = Buffer.from('fake jpeg bytes');

// A pretend Gemini: returns the given text, or throws the given error.
// The real SDK is never called in tests.
function geminiReturning(text: string | undefined): GenerateFn {
  return vi.fn().mockResolvedValue({ text });
}
function geminiThrowing(error: unknown): GenerateFn {
  return vi.fn().mockRejectedValue(error);
}

async function statusOf(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(HttpException);
  return (error as HttpException).getStatus();
}

describe('GeminiOcrService', () => {
  it('maps a saved Gemini answer to an OcrResult in integer cents', async () => {
    const ocr = new GeminiOcrService(
      geminiReturning(JSON.stringify(sample)),
      'gemini-3.8-flash',
    );
    const result = await ocr.extract(photo, 'image/jpeg');

    expect(result).toMatchObject({
      merchant: 'Maxwell Food Centre',
      date: '2026-11-01',
      subtotalCents: 2950,
      serviceCents: 295,
      gstCents: 292,
      totalCents: 3537,
      category: 'FOOD_DRINKS',
    });
    expect(result.items).toEqual([
      { name: 'Chicken Rice', unitPriceCents: 600, quantity: 1 },
      { name: 'Laksa', unitPriceCents: 750, quantity: 1 },
      { name: 'Tiger Beer', unitPriceCents: 800, quantity: 2 },
    ]);
    expect(result.raw).toEqual(sample);
  });

  it('sends the photo, the model and the answer shape in one call', async () => {
    const generate = geminiReturning(JSON.stringify(sample));
    await new GeminiOcrService(generate, 'gemini-3.8-flash').extract(
      photo,
      'image/png',
    );

    const request = vi.mocked(generate).mock.calls[0][0];
    expect(request.model).toBe('gemini-3.8-flash');
    expect(JSON.stringify(request.contents)).toContain(
      photo.toString('base64'),
    );
    expect(JSON.stringify(request.contents)).toContain('image/png');
    expect(request.config).toMatchObject({
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'LOW' },
      httpOptions: { timeout: 60_000 },
    });
    expect(request.config.responseJsonSchema).toBeDefined();
  });

  it('maps a real saved answer (NTUC, "2 FOR" deals) with the exact total', async () => {
    const result = await new GeminiOcrService(
      geminiReturning(JSON.stringify(ntuc)),
      'm',
    ).extract(photo, 'image/webp');

    // A deal stays one line at its total, so cents stay exact (no $3.975)
    expect(result.items).toContainEqual({
      name: '2x A BUTTER UNSALTD227G',
      unitPriceCents: 795,
      quantity: 1,
    });
    const sum = result.items.reduce(
      (a, i) => a + i.unitPriceCents * i.quantity,
      0,
    );
    expect(sum).toBe(3770);
    expect(result).toMatchObject({ totalCents: 3770, category: 'GROCERIES' });
    expect(result.date).toBeUndefined(); // no date was visible in the photo
  });

  it('turns missing (null) fields into undefined', async () => {
    const blurry = { ...sample, merchant: null, date: null, totalCents: null };
    const result = await new GeminiOcrService(
      geminiReturning(JSON.stringify(blurry)),
      'm',
    ).extract(photo, 'image/jpeg');
    expect(result.merchant).toBeUndefined();
    expect(result.date).toBeUndefined();
    expect(result.totalCents).toBeUndefined();
  });

  it.each([
    ['not JSON', 'Sorry, I cannot read this'],
    ['an empty answer', undefined],
    [
      'a price in dollars',
      JSON.stringify({
        ...sample,
        items: [{ name: 'Kopi', quantity: 1, unitPriceCents: 1.5 }],
      }),
    ],
    [
      'a negative price',
      JSON.stringify({
        ...sample,
        items: [{ name: 'Kopi', quantity: 1, unitPriceCents: -150 }],
      }),
    ],
    [
      'a quantity of 0',
      JSON.stringify({
        ...sample,
        items: [{ name: 'Kopi', quantity: 0, unitPriceCents: 150 }],
      }),
    ],
    [
      'an empty item name',
      JSON.stringify({
        ...sample,
        items: [{ name: ' ', quantity: 1, unitPriceCents: 150 }],
      }),
    ],
    ['an unknown category', JSON.stringify({ ...sample, category: 'FOOD' })],
    ['no items list', JSON.stringify({ merchant: 'Shop' })],
  ])('rejects %s with 422 instead of saving bad data', async (_case, text) => {
    const ocr = new GeminiOcrService(geminiReturning(text), 'm');
    expect(await statusOf(ocr.extract(photo, 'image/jpeg'))).toBe(422);
  });

  it('answers 429 with a friendly message when the free limit is reached', async () => {
    const ocr = new GeminiOcrService(
      geminiThrowing(new ApiError({ message: 'quota', status: 429 })),
      'm',
    );
    const error = await ocr.extract(photo, 'image/jpeg').catch((e) => e);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).message).toMatch(/add the items by hand/);
  });

  it.each([
    ['a Gemini server error', new ApiError({ message: 'down', status: 500 })],
    ['a network failure', new TypeError('fetch failed')],
  ])('answers 503 on %s, without crashing', async (_case, error) => {
    const ocr = new GeminiOcrService(geminiThrowing(error), 'm');
    expect(await statusOf(ocr.extract(photo, 'image/jpeg'))).toBe(503);
  });
});
