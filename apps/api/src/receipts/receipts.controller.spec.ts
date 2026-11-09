import type { OwnedBill } from '../bills/guards/bill-owner.guard.js';
import { ReceiptsController } from './receipts.controller.js';
import type { ReceiptsService } from './receipts.service.js';

describe('ReceiptsController', () => {
  it('passes the bill and the uploaded photo to the service', async () => {
    const draftFromPhoto = vi.fn().mockResolvedValue({ items: [] });
    const controller = new ReceiptsController({
      draftFromPhoto,
    } as unknown as ReceiptsService);
    const bill: OwnedBill = { id: 'b1', ownerId: 'u1', status: 'OPEN' };
    const photo = Buffer.from('png bytes');

    await controller.read(bill, { buffer: photo, mimetype: 'image/png' });

    expect(draftFromPhoto).toHaveBeenCalledWith(bill, photo, 'image/png');
  });
});
