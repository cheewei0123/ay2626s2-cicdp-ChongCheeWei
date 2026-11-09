import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiError,
  ThinkingLevel,
  type GenerateContentParameters,
} from '@google/genai';
import { z } from 'zod';
import { Category } from '../generated/prisma/enums.js';
import type { OcrResult, OcrService } from './ocr.interface.js';

// The shape Gemini must answer in. Used twice: sent to Gemini as the required
// JSON schema, and used again to check the answer before anything is saved.
const cents = z.number().int().nonnegative();
const receiptSchema = z.object({
  merchant: z.string().nullable(),
  date: z.string().nullable().describe('YYYY-MM-DD'),
  items: z.array(
    z.object({
      name: z.string().trim().min(1),
      quantity: z.number().int().min(1),
      unitPriceCents: cents,
    }),
  ),
  subtotalCents: cents.nullable(),
  serviceCents: cents.nullable(),
  gstCents: cents.nullable(),
  totalCents: cents.nullable(),
  category: z.enum(Category).nullable(),
});

const PROMPT = `You read Singapore receipts. Return every purchased item with its quantity
and its price for ONE unit, in integer cents (S$6.00 = 600).
Service charge and GST are separate fields, never items. Ignore payment and change
lines (CASH, VISA, NETS, CHANGE). A discount or promotion line is not an item:
subtract it from the price of the item it applies to (or the item above it).
If a deal (e.g. "2 FOR $7.95") makes the price of one unit not a whole number of
cents, return that line once: quantity 1, the deal's total price, and the count in
the name (e.g. "2x BUTTER").
Use null for anything the receipt does not show. Pick the category that fits the merchant.`;

// Only the part of the SDK this class needs, so tests can pass a pretend Gemini
export type GenerateFn = (
  request: GenerateContentParameters & {
    config: { responseMimeType: string; responseJsonSchema: unknown };
  },
) => Promise<{ text?: string }>;

const TRY_AGAIN = 'Try again later or add the items by hand.';

export class GeminiOcrService implements OcrService {
  readonly provider = 'gemini';

  constructor(
    private readonly generate: GenerateFn,
    private readonly model: string,
  ) {}

  async extract(image: Buffer, mimeType: string): Promise<OcrResult> {
    const answer = await this.ask(image, mimeType);

    // Never trust AI output: parse it and check every field and price
    let json: unknown;
    try {
      json = JSON.parse(answer ?? '');
    } catch {
      json = undefined;
    }
    const parsed = receiptSchema.safeParse(json);
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        'Could not read this receipt. Try a clearer photo or add the items by hand.',
      );
    }

    const r = parsed.data;
    return {
      merchant: r.merchant ?? undefined,
      date: r.date ?? undefined,
      items: r.items.map((i) => ({
        name: i.name,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
      })),
      subtotalCents: r.subtotalCents ?? undefined,
      serviceCents: r.serviceCents ?? undefined,
      gstCents: r.gstCents ?? undefined,
      totalCents: r.totalCents ?? undefined,
      category: r.category ?? undefined,
      raw: json,
    };
  }

  private async ask(image: Buffer, mimeType: string) {
    try {
      const response = await this.generate({
        model: this.model,
        contents: [
          { inlineData: { mimeType, data: image.toString('base64') } },
          { text: PROMPT },
        ],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(receiptSchema),
          // Reading a receipt needs little reasoning, so less thinking means a faster answer
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          // Free-tier speed varies (3-30+ s); give up after 60 s and let the user type the items
          httpOptions: { timeout: 60_000 },
        },
      });
      return response.text;
    } catch (error) {
      // 429 = the free tier's per-minute or per-day limit was reached
      if (error instanceof ApiError && error.status === 429) {
        throw new HttpException(
          `The receipt reader is busy (free limit reached). ${TRY_AGAIN}`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new ServiceUnavailableException(
        `The receipt reader is not answering. ${TRY_AGAIN}`,
      );
    }
  }
}
