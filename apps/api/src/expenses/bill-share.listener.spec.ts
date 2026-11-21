import { Test } from '@nestjs/testing';
import type { BillLockedEvent } from '../bills/bill-events.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillShareListener } from './bill-share.listener.js';

describe('BillShareListener (with a mocked database)', () => {
  let listener: BillShareListener;
  const prisma = {
    expense: { deleteMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  const date = new Date('2026-11-22');
  const event = (shares: BillLockedEvent['shares']): BillLockedEvent => ({
    billId: 'b1',
    merchant: 'Maxwell Food Centre',
    date,
    shares,
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    // Each query returns a marker, so the test can see what went into the transaction
    prisma.expense.deleteMany.mockImplementation((q) => ({ delete: q }));
    prisma.expense.upsert.mockImplementation((q) => ({ upsert: q }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        BillShareListener,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    listener = moduleRef.get(BillShareListener);
  });

  it('upserts one BILL_SHARE per person who owes, in one transaction', async () => {
    await listener.logShares(
      event([
        { userId: 'u1', amountCents: 720 },
        { userId: 'u2', amountCents: 0 },
      ]),
    );

    const [queries] = prisma.$transaction.mock.calls[0];
    expect(queries).toHaveLength(2);
    // u2 owes nothing now, so their row (if any) is removed
    expect(prisma.expense.deleteMany).toHaveBeenCalledWith({
      where: { billId: 'b1', source: 'BILL_SHARE', userId: { notIn: ['u1'] } },
    });
    expect(prisma.expense.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.expense.upsert).toHaveBeenCalledWith({
      where: { userId_billId: { userId: 'u1', billId: 'b1' } },
      create: {
        userId: 'u1',
        billId: 'b1',
        amountCents: 720,
        merchant: 'Maxwell Food Centre',
        spentAt: date,
        category: 'FOOD_DRINKS',
        source: 'BILL_SHARE',
      },
      // No category or note: a person's own changes survive locking again
      update: {
        amountCents: 720,
        merchant: 'Maxwell Food Centre',
        spentAt: date,
      },
    });
  });

  it('with nobody owing, only removes old rows', async () => {
    await listener.logShares(event([]));
    expect(prisma.expense.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(1);
  });
});
