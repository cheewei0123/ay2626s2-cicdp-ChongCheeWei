import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClaimsService } from './claims.service.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';

const open: OwnedBill = { id: 'b1', ownerId: 'u1', status: 'OPEN' };
const locked: OwnedBill = { ...open, status: 'LOCKED' };

describe('ClaimsService (with a mocked database)', () => {
  let service: ClaimsService;
  const prisma = {
    item: { findFirst: vi.fn() },
    claim: { upsert: vi.fn(), deleteMany: vi.fn() },
    bill: { update: vi.fn() },
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
