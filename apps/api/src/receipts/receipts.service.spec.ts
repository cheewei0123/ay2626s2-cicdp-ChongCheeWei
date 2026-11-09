import { ConflictException } from '@nestjs/common';
import type { OwnedBill } from '../bills/guards/bill-owner.guard.js';
import { FakeOcrService } from '../ocr/fake-ocr.service.js';
import type { OcrResult, OcrService } from '../ocr/ocr.interface.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ReceiptsService } from './receipts.service.js';

const open: OwnedBill = { id: 'b1', ownerId: 'u1', status: 'OPEN' };
const photo = Buffer.from('photo');
const kopi = { name: 'Kopi', unitPriceCents: 150, quantity: 1 };

// A reader that always returns the given receipt
function readerOf(receipt: Omit<OcrResult, 'raw'>): OcrService {
  return { provider: 'stub', extract: async () => ({ ...receipt, raw: {} }) };
}

describe('ReceiptsService (mocked database)', () => {
  // Only receiptImage.create: the draft never touches the bill or its items
  const prisma = { receiptImage: { create: vi.fn() } };
  const service = (ocr: OcrService) =>
    new ReceiptsService(prisma as unknown as PrismaService, ocr);

  beforeEach(() => vi.clearAllMocks());

  it('returns the items as a draft and keeps only the raw answer', async () => {
    const draft = await service(new FakeOcrService()).draftFromPhoto(
      open,
      photo,
      'image/jpeg',
    );

    expect(draft.items).toEqual([
      { name: 'Chicken Rice', unitPriceCents: 600, quantity: 1 },
      { name: 'Laksa', unitPriceCents: 750, quantity: 1 },
      { name: 'Tiger Beer', unitPriceCents: 800, quantity: 2 },
    ]);
    expect(draft.receipt).toMatchObject({
      merchant: 'Maxwell Food Centre',
      totalCents: 3537,
    });
    expect(draft.receipt).not.toHaveProperty('raw');
    expect(prisma.receiptImage.create).toHaveBeenCalledWith({
      data: {
        billId: 'b1',
        ocrProvider: 'fake',
        rawJson: { provider: 'fake' },
      },
    });
  });

  it('suggests 10% service + 9% GST when the receipt shows both, and the totals match', async () => {
    const draft = await service(new FakeOcrService()).draftFromPhoto(
      open,
      photo,
      'image/jpeg',
    );
    expect(draft).toMatchObject({ serviceBp: 1000, gstBp: 900 });
    expect(draft.check).toEqual({
      itemsSubtotalCents: 2950,
      receiptSubtotalCents: 2950,
      subtotalMatches: true,
      totalCents: 3537,
      receiptTotalCents: 3537,
      totalMatches: true,
    });
  });

  it('suggests 0% service and 0% GST for a GST-inclusive receipt', async () => {
    // Like McDonald's or a food court: total = subtotal, "GST incl." printed
    const draft = await service(
      readerOf({
        items: [kopi],
        subtotalCents: 150,
        gstCents: 12,
        totalCents: 150,
      }),
    ).draftFromPhoto(open, photo, 'image/jpeg');
    expect(draft).toMatchObject({ serviceBp: 0, gstBp: 0 });
    expect(draft.check).toMatchObject({ totalCents: 150, totalMatches: true });
  });

  it('spots GST-inclusive receipts that print no subtotal line', async () => {
    // Like the café receipt: only "Total $64.50, 15% tax included"
    const draft = await service(
      readerOf({ items: [kopi], gstCents: 12, totalCents: 150 }),
    ).draftFromPhoto(open, photo, 'image/jpeg');
    expect(draft.gstBp).toBe(0);
  });

  it('warns when an item was misread (sum differs from the subtotal)', async () => {
    const draft = await service(
      readerOf({ items: [kopi], subtotalCents: 300 }),
    ).draftFromPhoto(open, photo, 'image/jpeg');
    expect(draft.check).toMatchObject({
      itemsSubtotalCents: 150,
      receiptSubtotalCents: 300,
      subtotalMatches: false,
    });
  });

  it('cannot check what the receipt does not show', async () => {
    const draft = await service(readerOf({ items: [kopi] })).draftFromPhoto(
      open,
      photo,
      'image/jpeg',
    );
    expect(draft.check.subtotalMatches).toBeNull();
    expect(draft.check.totalMatches).toBeNull();
  });

  it('refuses a locked bill before calling the AI, so no free quota is used', async () => {
    const ocr = new FakeOcrService();
    const extract = vi.spyOn(ocr, 'extract');
    await expect(
      service(ocr).draftFromPhoto(
        { ...open, status: 'LOCKED' },
        photo,
        'image/jpeg',
      ),
    ).rejects.toThrow(ConflictException);
    expect(extract).not.toHaveBeenCalled();
    expect(prisma.receiptImage.create).not.toHaveBeenCalled();
  });
});
