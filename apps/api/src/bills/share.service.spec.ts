import { ConflictException, NotFoundException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OwnedBill } from './guards/bill-owner.guard.js';
import { ShareService } from './share.service.js';

const open: OwnedBill = { id: 'b1', ownerId: 'u1', status: 'OPEN' };

describe('ShareService (with a mocked database)', () => {
  let service: ShareService;
  let jwt: JwtService;
  const prisma = {
    bill: { findUnique: vi.fn() },
    participant: { findMany: vi.fn(), create: vi.fn() },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [ShareService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ShareService);
    jwt = moduleRef.get(JwtService);
  });

  describe('view', () => {
    it('only asks the database for fields a guest may see', async () => {
      prisma.bill.findUnique.mockResolvedValue({
        title: 'Dinner',
        serviceBp: 1000,
        gstBp: 900,
        owner: { displayName: 'Chee' },
        items: [{ unitPriceCents: 600, quantity: 1 }],
        participants: [],
      });

      const view = await service.view('b1');

      const select = prisma.bill.findUnique.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('ownerId');
      expect(select).not.toHaveProperty('shareToken');
      expect(select.owner).toEqual({ select: { displayName: true } });
      expect(select.participants.select).not.toHaveProperty('userId');
      // 600 + 60 service + 59 GST (9% of 660 = 59.4, rounded half up)
      expect(view.totals.totalCents).toBe(719);
    });

    it('answers 404 if the bill is gone', async () => {
      prisma.bill.findUnique.mockResolvedValue(null);
      await expect(service.view('b1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('join', () => {
    it('adds a participant and returns a 24-hour guest token', async () => {
      prisma.participant.findMany.mockResolvedValue([{ displayName: 'Chee' }]);
      prisma.participant.create.mockResolvedValue({
        id: 'p1',
        displayName: 'Ben',
      });

      const result = await service.join(open, 'Ben');

      expect(prisma.participant.create.mock.calls[0][0].data).toEqual({
        billId: 'b1',
        displayName: 'Ben',
      });
      expect(result.participant).toEqual({ id: 'p1', displayName: 'Ben' });
      const payload = await jwt.verifyAsync(result.guestToken);
      expect(payload).toMatchObject({ sub: 'p1', billId: 'b1', typ: 'guest' });
      expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
    });

    it('gives a repeated name a suffix', async () => {
      prisma.participant.findMany.mockResolvedValue([{ displayName: 'Ben' }]);
      prisma.participant.create.mockResolvedValue({
        id: 'p2',
        displayName: 'Ben (2)',
      });
      await service.join(open, 'Ben');
      expect(prisma.participant.create.mock.calls[0][0].data.displayName).toBe(
        'Ben (2)',
      );
    });

    it.each(['LOCKED', 'SETTLED'] as const)(
      'answers 409 when the bill is %s',
      async (status) => {
        await expect(service.join({ ...open, status }, 'Ben')).rejects.toThrow(
          ConflictException,
        );
        expect(prisma.participant.create).not.toHaveBeenCalled();
      },
    );
  });

  describe('shareTokenFor (join code)', () => {
    it('finds the share token for a code, ignoring case', async () => {
      prisma.bill.findUnique.mockResolvedValue({
        shareToken: 'tok',
        status: 'OPEN',
      });
      expect(await service.shareTokenFor('k7p2q')).toEqual({
        shareToken: 'tok',
      });
      expect(prisma.bill.findUnique.mock.calls[0][0].where).toEqual({
        joinCode: 'K7P2Q',
      });
    });

    it('answers 404 for a badly shaped code without asking the database', async () => {
      await expect(service.shareTokenFor('nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.bill.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown code', null],
      ['a settled bill', { shareToken: 'tok', status: 'SETTLED' }],
    ])('answers 404 for %s', async (_case, found) => {
      prisma.bill.findUnique.mockResolvedValue(found);
      await expect(service.shareTokenFor('K7P2Q')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
