import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClaimsService } from './claims.service.js';
import type { SetSplitDto } from './dto/set-split.dto.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';

const open: OwnedBill = { id: 'b1', ownerId: 'u1', status: 'OPEN' };
const locked: OwnedBill = { ...open, status: 'LOCKED' };

// Tiger Beer x2 ($16.00), claimed by Ben and Dan
const tiger = {
  id: 'i1',
  unitPriceCents: 800,
  quantity: 2,
  claims: [
    { participantId: 'ben', shares: 1 },
    { participantId: 'dan', shares: 1 },
  ],
};
const percent = (ben: number, dan: number): SetSplitDto => ({
  splitMode: 'PERCENT',
  entries: [
    { participantId: 'ben', percentBp: ben },
    { participantId: 'dan', percentBp: dan },
  ],
});

describe('ClaimsService (with a mocked database)', () => {
  let service: ClaimsService;
  const prisma = {
    item: { findFirst: vi.fn(), update: vi.fn() },
    claim: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    bill: { update: vi.fn() },
    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [ClaimsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ClaimsService);
  });

  describe('claim', () => {
    it('claims an item of this bill with 1 share by default', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 'i1' });
      prisma.claim.upsert.mockResolvedValue({
        itemId: 'i1',
        participantId: 'p1',
        shares: 1,
      });

      await service.claim(open, 'p1', 'i1');

      expect(prisma.item.findFirst.mock.calls[0][0].where).toEqual({
        id: 'i1',
        billId: 'b1',
      });
      expect(prisma.claim.upsert.mock.calls[0][0]).toMatchObject({
        where: { itemId_participantId: { itemId: 'i1', participantId: 'p1' } },
        create: { itemId: 'i1', participantId: 'p1', shares: 1 },
      });
    });

    it('updates the same claim instead of adding a second one (upsert)', async () => {
      prisma.item.findFirst.mockResolvedValue({ id: 'i1' });
      await service.claim(open, 'p1', 'i1', 2);
      expect(prisma.claim.upsert.mock.calls[0][0].update).toEqual({
        shares: 2,
      });
    });

    it('answers 404 for an item from another bill', async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(service.claim(open, 'p1', 'other-item')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.claim.upsert).not.toHaveBeenCalled();
    });

    it('answers 409 once the bill is locked', async () => {
      await expect(service.claim(locked, 'p1', 'i1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.item.findFirst).not.toHaveBeenCalled();
    });

    it('puts a PERCENT item back to EQUAL when someone new claims it', async () => {
      prisma.item.findFirst.mockResolvedValue({
        id: 'i1',
        splitMode: 'PERCENT',
      });
      prisma.claim.findUnique.mockResolvedValue(null);

      await service.claim(open, 'carl', 'i1');

      expect(prisma.item.update.mock.calls[0][0].data).toEqual({
        splitMode: 'EQUAL',
      });
      expect(prisma.claim.updateMany.mock.calls[0][0]).toEqual({
        where: { itemId: 'i1' },
        data: { percentBp: null, exactCents: null },
      });
    });

    it('keeps the split when someone already on the item taps it again', async () => {
      prisma.item.findFirst.mockResolvedValue({
        id: 'i1',
        splitMode: 'PERCENT',
      });
      prisma.claim.findUnique.mockResolvedValue({ itemId: 'i1' });
      await service.claim(open, 'ben', 'i1');
      expect(prisma.item.update).not.toHaveBeenCalled();
    });
  });

  describe('setSplit', () => {
    beforeEach(() => prisma.item.findFirst.mockResolvedValue(tiger));

    it('Ben 70% / Dan 30% of $16.00 → 1120 / 480, saved together', async () => {
      const result = await service.setSplit(
        open,
        'i1',
        percent(7000, 3000),
        'ben',
      );

      expect(result).toEqual({
        itemId: 'i1',
        splitMode: 'PERCENT',
        portions: [
          { participantId: 'ben', cents: 1120 },
          { participantId: 'dan', cents: 480 },
        ],
      });
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(prisma.item.update.mock.calls[0][0].data).toEqual({
        splitMode: 'PERCENT',
      });
      expect(prisma.claim.update).toHaveBeenCalledTimes(2);
      expect(prisma.claim.update.mock.calls[0][0].data).toEqual({
        shares: 1,
        percentBp: 7000,
        exactCents: null,
      });
    });

    it('lets the owner change it too', async () => {
      await expect(
        service.setSplit(open, 'i1', percent(5000, 5000), null),
      ).resolves.toMatchObject({ splitMode: 'PERCENT' });
    });

    it('answers 403 for a guest who did not claim the item', async () => {
      await expect(
        service.setSplit(open, 'i1', percent(7000, 3000), 'ali'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('answers 400 when someone on the item is left out', async () => {
      const onlyBen: SetSplitDto = {
        splitMode: 'PERCENT',
        entries: [{ participantId: 'ben', percentBp: 10000 }],
      };
      await expect(
        service.setSplit(open, 'i1', onlyBen, 'ben'),
      ).rejects.toThrow(
        'entries must list exactly the people who claimed this item',
      );
    });

    it('answers 400 when exact amounts do not add up to the price', async () => {
      const exact: SetSplitDto = {
        splitMode: 'EXACT',
        entries: [
          { participantId: 'ben', exactCents: 1000 },
          { participantId: 'dan', exactCents: 500 },
        ],
      };
      const attempt = service.setSplit(open, 'i1', exact, 'ben');
      await expect(attempt).rejects.toThrow(BadRequestException);
      await expect(attempt).rejects.toThrow(
        'Exact amounts add up to $15.00, need $16.00',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('answers 404 for an item that is not on this bill', async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(
        service.setSplit(open, 'nope', percent(7000, 3000), 'ben'),
      ).rejects.toThrow(NotFoundException);
    });

    it('answers 409 once the bill is locked', async () => {
      await expect(
        service.setSplit(locked, 'i1', percent(7000, 3000), 'ben'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('unclaim', () => {
    it('only removes this guest’s claim on an item of this bill', async () => {
      prisma.claim.deleteMany.mockResolvedValue({ count: 1 });
      await service.unclaim(open, 'p1', 'i1');
      expect(prisma.claim.deleteMany.mock.calls[0][0].where).toEqual({
        itemId: 'i1',
        participantId: 'p1',
        item: { billId: 'b1' },
      });
    });

    it('puts an EXACT item back to EQUAL when someone leaves it', async () => {
      prisma.item.findFirst.mockResolvedValue({ splitMode: 'EXACT' });
      prisma.claim.deleteMany.mockResolvedValue({ count: 1 });
      await service.unclaim(open, 'dan', 'i1');
      expect(prisma.item.update.mock.calls[0][0].data).toEqual({
        splitMode: 'EQUAL',
      });
    });

    it('answers 404 when there was nothing to remove', async () => {
      prisma.claim.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.unclaim(open, 'p1', 'i1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('answers 409 once the bill is locked', async () => {
      await expect(service.unclaim(locked, 'p1', 'i1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('lock and unlock', () => {
    it('locks an OPEN bill', async () => {
      prisma.bill.update.mockResolvedValue({ id: 'b1', status: 'LOCKED' });
      expect(await service.lock(open)).toEqual({ id: 'b1', status: 'LOCKED' });
      expect(prisma.bill.update.mock.calls[0][0]).toMatchObject({
        where: { id: 'b1' },
        data: { status: 'LOCKED' },
      });
    });

    it('unlocks a LOCKED bill', async () => {
      prisma.bill.update.mockResolvedValue({ id: 'b1', status: 'OPEN' });
      await service.unlock(locked);
      expect(prisma.bill.update.mock.calls[0][0].data).toEqual({
        status: 'OPEN',
      });
    });

    it.each([
      ['lock a bill that is already LOCKED', 'lock', 'LOCKED'],
      ['lock a SETTLED bill', 'lock', 'SETTLED'],
      ['unlock an OPEN bill', 'unlock', 'OPEN'],
      ['unlock a SETTLED bill', 'unlock', 'SETTLED'],
    ] as const)('answers 409 to %s', async (_case, action, status) => {
      await expect(service[action]({ ...open, status })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.bill.update).not.toHaveBeenCalled();
    });
  });
});
